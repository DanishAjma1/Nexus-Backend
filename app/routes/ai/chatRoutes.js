import express from "express";
import fs from "fs";
import path from "path";
import openai from "../../config/ai/openai.js";
import jwt from "jsonwebtoken";
import User from "../../models/user.js";
import Investor from "../../models/investor.js";
import Entrepreneur from "../../models/enterpreneur.js";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const CHAT_MATCH_LIMIT = 5;
const AI_MODEL = process.env.OPEN_AI_CHAT_MODEL || "gpt-4o-mini";
const AI_TIMEOUT_MS = Math.max(1000, Number(process.env.OPEN_AI_TIMEOUT_MS || 12000));
const AI_MAX_RETRIES = Math.max(0, Number(process.env.OPEN_AI_MAX_RETRIES || 1));
const AI_RETRY_DELAY_MS = Math.max(0, Number(process.env.OPEN_AI_RETRY_DELAY_MS || 350));
const MATCH_CONTEXT_TTL_MS = Math.max(60_000, Number(process.env.MATCH_CONTEXT_TTL_MS || 20 * 60 * 1000));

const recentMatchContext = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createTimeoutError = (operation, timeoutMs) => {
  const error = new Error(`${operation} timed out after ${timeoutMs}ms`);
  error.code = "AI_TIMEOUT";
  return error;
};

const withTimeoutAndRetry = async ({ operation, timeoutMs, retries, retryDelayMs, fn }) => {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => {
          setTimeout(() => reject(createTimeoutError(operation, timeoutMs)), timeoutMs);
        }),
      ]);

      return { ok: true, result, attempts: attempt + 1, timedOut: false };
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= retries;
      if (isLastAttempt) break;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  return {
    ok: false,
    error: lastError,
    attempts: retries + 1,
    timedOut: lastError?.code === "AI_TIMEOUT",
  };
};

const normalizeIndustry = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");

const toIndustryList = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const tokenizeIndustry = (value) => normalizeIndustry(value).split(" ").filter(Boolean);

const relationScore = (a, b) => {
  const x = normalizeIndustry(a);
  const y = normalizeIndustry(b);

  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;

  const xTokens = new Set(tokenizeIndustry(x));
  const yTokens = new Set(tokenizeIndustry(y));
  const union = new Set([...xTokens, ...yTokens]).size;

  if (union === 0) return 0;

  let intersection = 0;
  for (const token of xTokens) {
    if (yTokens.has(token)) intersection += 1;
  }

  const jaccard = intersection / union;
  if (jaccard >= 0.5) return 0.7;
  if (jaccard >= 0.34) return 0.55;
  return 0;
};

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const buildMatchContextKey = ({ userId, role }) => {
  if (!userId || !role) return null;
  return `${String(userId).trim().toLowerCase()}::${String(role).trim().toLowerCase()}`;
};

const setRecentMatchContext = ({ userId, role, context }) => {
  const key = buildMatchContextKey({ userId, role });
  if (!key || !context) return;

  recentMatchContext.set(key, {
    ...context,
    updatedAt: Date.now(),
  });
};

const getRecentMatchContext = ({ userId, role }) => {
  const key = buildMatchContextKey({ userId, role });
  if (!key) return null;

  const current = recentMatchContext.get(key);
  if (!current) return null;

  if (Date.now() - current.updatedAt > MATCH_CONTEXT_TTL_MS) {
    recentMatchContext.delete(key);
    return null;
  }

  return current;
};

const getMatchIntent = (message) => {
  const text = String(message || "").toLowerCase().trim();
  if (!text) return null;

  const asksInvestor = /(investor|investors)/.test(text);
  const asksEntrepreneur = /(entrepreneur|entrepreneurs|founder|founders|startup|startups)/.test(text);
  const hasTargetRole = asksInvestor || asksEntrepreneur;

  // Do not hijack follow-up explanation questions (e.g., "how is he best for me?").
  const isExplanationFollowUp = /(why|how|explain|reason|details?|tell me more|elaborate)/.test(text);
  const referencesPriorSuggestion = /\b(he|she|they|him|her|them|this|that|it)\b/.test(text);
  if (isExplanationFollowUp && referencesPriorSuggestion) {
    return null;
  }

  // Trigger only on explicit recommendation requests, not any sentence containing "match".
  const explicitRecommendationPatterns = [
    /\b(recommend|suggest)\b.*\b(investor|investors|entrepreneur|entrepreneurs|founder|founders|startup|startups|match|matches)\b/,
    /\b(find|show|list|give)\b.*\b(me\s+)?(investor|investors|entrepreneur|entrepreneurs|founder|founders|startup|startups|matches?)\b/,
    /\b(top|best)\b.*\b(investor|investors|entrepreneur|entrepreneurs|founder|founders|startup|startups|matches?)\b/,
    /\bwho\s+should\s+i\s+connect\s+with\b/,
    /\bmatch\s+me\s+with\b.*\b(investor|investors|entrepreneur|entrepreneurs|founder|founders|startup|startups)\b/,
    /^\s*match\s+(investor|investors|entrepreneur|entrepreneurs|founder|founders|startup|startups)\s*$/,
  ];

  const asksForMatch = explicitRecommendationPatterns.some((pattern) => pattern.test(text));
  if (!asksForMatch) return null;

  // If user explicitly asks for role-agnostic "matches" we can still serve role-based suggestions.
  if (!hasTargetRole && !/\b(match|matches|recommendation|recommendations)\b/.test(text)) {
    return null;
  }

  return {
    asksInvestor,
    asksEntrepreneur,
  };
};

const getMatchExplanationIntent = (message) => {
  const text = String(message || "").toLowerCase().trim();
  if (!text) return null;

  const asksExplanation = /(why|how|explain|reason|details?|tell me more|elaborate|what makes)/.test(text);
  const mentionsRecommendation = /(match|matched|fit|recommend|suggest|best|suitable|good for me|for me)/.test(text);

  if (!(asksExplanation && mentionsRecommendation)) {
    return null;
  }

  const ordinals = [
    { regex: /\b1st\b|\bfirst\b|\bnumber\s*1\b|\b#1\b|\btop\s*1\b/, index: 0 },
    { regex: /\b2nd\b|\bsecond\b|\bnumber\s*2\b|\b#2\b|\btop\s*2\b/, index: 1 },
    { regex: /\b3rd\b|\bthird\b|\bnumber\s*3\b|\b#3\b|\btop\s*3\b/, index: 2 },
    { regex: /\b4th\b|\bfourth\b|\bnumber\s*4\b|\b#4\b|\btop\s*4\b/, index: 3 },
    { regex: /\b5th\b|\bfifth\b|\bnumber\s*5\b|\b#5\b|\btop\s*5\b/, index: 4 },
  ];

  const ordinalHit = ordinals.find(({ regex }) => regex.test(text));
  return {
    text,
    requestedIndex: ordinalHit ? ordinalHit.index : null,
  };
};

const ensurePoliteNameAddressing = (content, userName) => {
  if (!userName || !content) return content;

  const escapedName = userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasName = new RegExp(`\\b${escapedName}\\b`, "i").test(content);
  if (hasName) return content;

  return `Certainly, ${userName}. ${content}`;
};

const getUserContextFromRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) return { userName: null, userId: null, role: null };

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return {
      userName: (decoded?.name || "").trim() || null,
      userId: String(decoded?.userId || "").trim() || null,
      role: String(decoded?.role || "").trim().toLowerCase() || null,
    };
  } catch {
    return { userName: null, userId: null, role: null };
  }
};

const getSourceIndustries = async (role, userId) => {
  if (!role || !userId) return [];
  if (role === "investor") {
    const profile = await Investor.findOne({ userId });
    return toIndustryList(profile?.investmentInterests);
  }
  if (role === "entrepreneur") {
    const profile = await Entrepreneur.findOne({ userId });
    return toIndustryList(profile?.industry);
  }
  return [];
};

const fetchCandidatesForRole = async (role) => {
  if (role === "investor") {
    return User.aggregate([
      {
        $match: {
          role: "entrepreneur",
          approvalStatus: "approved",
          isBlocked: { $ne: true },
          isSuspended: { $ne: true },
        },
      },
      {
        $lookup: {
          from: "enterpreneurs",
          localField: "_id",
          foreignField: "userId",
          as: "profile",
        },
      },
      { $unwind: "$profile" },
      { $addFields: { userId: "$_id" } },
      { $replaceRoot: { newRoot: { $mergeObjects: ["$$ROOT", "$profile"] } } },
      { $project: { profile: 0, password: 0, __v: 0 } },
      { $sort: { createdAt: -1 } },
      { $limit: 150 },
    ]);
  }

  return User.aggregate([
    {
      $match: {
        role: "investor",
        approvalStatus: "approved",
        isBlocked: { $ne: true },
        isSuspended: { $ne: true },
      },
    },
    {
      $lookup: {
        from: "investors",
        localField: "_id",
        foreignField: "userId",
        as: "profile",
      },
    },
    { $unwind: "$profile" },
    { $addFields: { userId: "$_id" } },
    { $replaceRoot: { newRoot: { $mergeObjects: ["$$ROOT", "$profile"] } } },
    { $project: { profile: 0, password: 0, __v: 0 } },
    { $sort: { createdAt: -1 } },
    { $limit: 150 },
  ]);
};

const extractCandidateIndustries = (role, candidate) =>
  role === "investor"
    ? toIndustryList(candidate?.industry)
    : toIndustryList(candidate?.investmentInterests);

const getMatchedIndustries = (sourceIndustries, candidateIndustries) => {
  const exact = [];
  const related = [];
  let score = 0;

  for (const candidateIndustry of candidateIndustries) {
    let bestScore = 0;
    let matchedSource = "";

    for (const sourceIndustry of sourceIndustries) {
      const current = relationScore(sourceIndustry, candidateIndustry);
      if (current > bestScore) {
        bestScore = current;
        matchedSource = sourceIndustry;
      }
    }

    if (bestScore >= 1) {
      exact.push(candidateIndustry);
      score += 100;
    } else if (bestScore >= 0.55) {
      related.push(`${candidateIndustry} (related to ${matchedSource})`);
      score += Math.round(bestScore * 100);
    }
  }

  return { exact, related, score };
};

const buildMatchSuggestionReply = async ({ role, userId, userName }) => {
  if (!role || !userId) return null;

  const sourceIndustries = await getSourceIndustries(role, userId);
  if (!sourceIndustries.length) {
    const title = role === "entrepreneur" ? "investor" : "entrepreneur";
    return {
      content: ensurePoliteNameAddressing(
        `Please update your profile industries first, then I can suggest the best ${title} matches for you.`,
        userName
      ),
      matches: [],
      sourceIndustries,
    };
  }

  const candidates = await fetchCandidatesForRole(role);
  const scored = candidates
    .map((candidate) => {
      const candidateIndustries = extractCandidateIndustries(role, candidate);
      const match = getMatchedIndustries(sourceIndustries, candidateIndustries);
      return {
        ...candidate,
        aiMatch: match,
      };
    })
    .filter((candidate) => candidate.aiMatch.exact.length || candidate.aiMatch.related.length)
    .sort((a, b) => b.aiMatch.score - a.aiMatch.score)
    .slice(0, CHAT_MATCH_LIMIT);

  if (!scored.length) {
    const title = role === "entrepreneur" ? "investor" : "entrepreneur";
    return {
      content: ensurePoliteNameAddressing(
        `I could not find strong ${title} industry matches yet. Try broadening your profile interests to get better recommendations.`,
        userName
      ),
      matches: [],
      sourceIndustries,
    };
  }

  const targetTitle = role === "entrepreneur" ? "investor" : "entrepreneur";
  const lines = scored.map((candidate, index) => {
    const name = cleanText(candidate?.name) || cleanText(candidate?.startupName) || `Match ${index + 1}`;
    const exact = candidate.aiMatch.exact.length
      ? `Exact: ${candidate.aiMatch.exact.join(", ")}`
      : "";
    const related = candidate.aiMatch.related.length
      ? `Related: ${candidate.aiMatch.related.join(", ")}`
      : "";
    const reason = [exact, related].filter(Boolean).join(" | ");
    return `${index + 1}. ${name} - ${reason}`;
  });

  const structuredMatches = scored.map((candidate, index) => ({
    rank: index + 1,
    name: cleanText(candidate?.name) || cleanText(candidate?.startupName) || `Match ${index + 1}`,
    exact: candidate.aiMatch.exact,
    related: candidate.aiMatch.related,
    score: candidate.aiMatch.score,
  }));

  return {
    content: ensurePoliteNameAddressing(
      `Here are your top ${targetTitle} matches based on industry alignment:\n${lines.join("\n")}`,
      userName
    ),
    matches: structuredMatches,
    sourceIndustries,
  };
};

const selectExplainedMatch = ({ explanationIntent, context }) => {
  if (!context?.matches?.length) return null;

  if (Number.isInteger(explanationIntent?.requestedIndex)) {
    return context.matches[explanationIntent.requestedIndex] || context.matches[0];
  }

  const messageText = explanationIntent?.text || "";
  const directNameHit = context.matches.find((item) =>
    item.name && messageText.includes(String(item.name).toLowerCase())
  );

  return directNameHit || context.matches[0];
};

const buildMatchExplanationReply = ({ role, userName, context, explanationIntent }) => {
  if (!role || !context?.matches?.length) return null;

  const focus = selectExplainedMatch({ explanationIntent, context });
  if (!focus) return null;

  const targetTitle = role === "entrepreneur" ? "investor" : "entrepreneur";
  const exactReason = focus.exact?.length
    ? `Exact industry overlap: ${focus.exact.join(", ")}.`
    : "No exact overlap found.";
  const relatedReason = focus.related?.length
    ? `Related industry alignment: ${focus.related.join(", ")}.`
    : "No strong related overlap beyond exact industries.";
  const source = context.sourceIndustries?.length
    ? `Your profile industries/interests: ${context.sourceIndustries.join(", ")}.`
    : "";

  const explanation = `Great question. ${focus.name} is a strong ${targetTitle} match for you because ${exactReason} ${relatedReason} ${source} I can also break down the next match if you want.`
    .replace(/\s+/g, " ")
    .trim();

  return ensurePoliteNameAddressing(explanation, userName);
};

// Load and merge behavior instructions from both files when available.
const behaviorPrimaryPath = path.join(__dirname, "../../trustbridge_ai.txt");
const behaviorFallbackPath = path.join(__dirname, "../../config/ai/behavior.txt");
const defaultBehaviorInstructions = "You are TrustBridge AI Assistant, a helpful guide for the platform.";

const readBehaviorFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, "utf-8").trim();
    return content || null;
  } catch {
    return null;
  }
};

const primaryBehaviorInstructions = readBehaviorFile(behaviorPrimaryPath);
const fallbackBehaviorInstructions = readBehaviorFile(behaviorFallbackPath);

const behaviorInstructions = [
  primaryBehaviorInstructions,
  fallbackBehaviorInstructions,
].filter(Boolean).join("\n\n");

if (!behaviorInstructions) {
  console.error("Error reading chatbot behavior instructions:", {
    primary: behaviorPrimaryPath,
    fallback: behaviorFallbackPath,
  });
}

const effectiveBehaviorInstructions = behaviorInstructions || defaultBehaviorInstructions;

router.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    const userContext = getUserContextFromRequest(req);
    const loggedInUserName = userContext.userName;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const explanationIntent = getMatchExplanationIntent(message);
    if (explanationIntent && userContext.userId && userContext.role) {
      const recentContext = getRecentMatchContext({
        userId: userContext.userId,
        role: userContext.role,
      });

      const explanationContent = buildMatchExplanationReply({
        role: userContext.role,
        userName: loggedInUserName,
        context: recentContext,
        explanationIntent,
      });

      if (explanationContent) {
        return res.json({
          success: true,
          aiMessage: {
            role: "assistant",
            content: explanationContent,
            source: "heuristic",
          },
          aiMeta: {
            source: "heuristic",
            fallback: false,
            reason: "match_explanation",
          },
        });
      }
    }

    const matchIntent = getMatchIntent(message);
    if (matchIntent && userContext.userId && userContext.role) {
      const shouldServeMatchSuggestion =
        (userContext.role === "entrepreneur" && !matchIntent.asksEntrepreneur) ||
        (userContext.role === "investor" && !matchIntent.asksInvestor);

      if (shouldServeMatchSuggestion) {
        const suggestionResult = await buildMatchSuggestionReply({
          role: userContext.role,
          userId: userContext.userId,
          userName: loggedInUserName,
        });

        if (suggestionResult?.content) {
          if (suggestionResult.matches?.length) {
            setRecentMatchContext({
              userId: userContext.userId,
              role: userContext.role,
              context: {
                sourceIndustries: suggestionResult.sourceIndustries || [],
                matches: suggestionResult.matches,
              },
            });
          }

          return res.json({
            success: true,
            aiMessage: {
              role: "assistant",
              content: suggestionResult.content,
              source: "heuristic",
            },
            aiMeta: {
              source: "heuristic",
              fallback: false,
            },
          });
        }
      }
    }

    const personalizationInstruction = loggedInUserName
      ? `The logged-in user's name is ${loggedInUserName}. Politely address them by name naturally at appropriate moments (for example at the start or end), but do not overuse the name in every sentence.`
      : "";

    const messages = [
      {
        role: "system",
        content: `${effectiveBehaviorInstructions}\n\n${personalizationInstruction}`.trim(),
      },
      ...(history || []),
      { role: "user", content: message },
    ];

    const completionResult = await withTimeoutAndRetry({
      operation: "chat-completion",
      timeoutMs: AI_TIMEOUT_MS,
      retries: AI_MAX_RETRIES,
      retryDelayMs: AI_RETRY_DELAY_MS,
      fn: () =>
        openai.chat.completions.create({
          model: AI_MODEL,
          messages,
          temperature: 0.7,
        }),
    });

    if (!completionResult.ok) {
      console.error(
        "AI Chat completion failed, using fallback:",
        completionResult.error?.message || completionResult.error
      );

      const fallbackContent = ensurePoliteNameAddressing(
        "I am facing a temporary delay from the AI service right now. I can still help with basic guidance, or you can try again in a moment for a full AI response.",
        loggedInUserName
      );

      return res.json({
        success: true,
        aiMessage: {
          role: "assistant",
          content: fallbackContent,
          source: "heuristic",
        },
        aiMeta: {
          source: "heuristic",
          fallback: true,
          reason: completionResult.timedOut ? "timeout" : "openai_error",
          attempts: completionResult.attempts,
        },
      });
    }

    const aiMessage = completionResult.result.choices[0].message;
    if (aiMessage?.content) {
      aiMessage.content = ensurePoliteNameAddressing(
        aiMessage.content,
        loggedInUserName
      );
    }
    aiMessage.source = "openai";
    res.json({
      success: true,
      aiMessage,
      aiMeta: {
        source: "openai",
        fallback: false,
        attempts: completionResult.attempts,
      },
    });
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: "Failed to communicate with AI" });
  }
});

export default router;
