import express from "express";
import User from "../../models/user.js";
import Investor from "../../models/investor.js";
import Entrepreneur from "../../models/enterpreneur.js";
import openai from "../../config/ai/openai.js";

const router = express.Router();

const MAX_RECOMMENDATIONS = 6;
const AI_SHORTLIST_LIMIT = 40;
const AI_MODEL = process.env.OPEN_AI_RECOMMENDER_MODEL || "gpt-4o-mini";
const AI_TIMEOUT_MS = Math.max(1000, Number(process.env.OPEN_AI_TIMEOUT_MS || 12000));
const AI_MAX_RETRIES = Math.max(0, Number(process.env.OPEN_AI_MAX_RETRIES || 1));
const AI_RETRY_DELAY_MS = Math.max(0, Number(process.env.OPEN_AI_RETRY_DELAY_MS || 350));

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

const calculateMatch = (sourceIndustries, candidateIndustries) => {
  const exactMatches = new Set();
  const relatedMatches = new Set();
  let score = 0;

  for (const candidateIndustry of candidateIndustries) {
    let bestRelation = 0;
    let bestSourceIndustry = "";

    for (const sourceIndustry of sourceIndustries) {
      const currentScore = relationScore(sourceIndustry, candidateIndustry);
      if (currentScore > bestRelation) {
        bestRelation = currentScore;
        bestSourceIndustry = sourceIndustry;
      }
    }

    if (bestRelation >= 1) {
      exactMatches.add(candidateIndustry);
      score += 100;
    } else if (bestRelation >= 0.55) {
      relatedMatches.add(candidateIndustry);
      score += Math.round(bestRelation * 100);
    }

    if (bestSourceIndustry && bestRelation >= 0.55) {
      score += 5;
    }
  }

  return {
    score,
    exactMatches: Array.from(exactMatches),
    relatedMatches: Array.from(relatedMatches),
  };
};

const toCandidateId = (candidate) => String(candidate?.userId || candidate?._id || "");

const extractCandidateIndustries = (role, candidate) =>
  role === "investor"
    ? toIndustryList(candidate?.industry)
    : toIndustryList(candidate?.investmentInterests);

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const buildOpenAiCandidatePayload = (role, candidate) => {
  const candidateIndustries = extractCandidateIndustries(role, candidate);
  return {
    id: toCandidateId(candidate),
    name: cleanText(candidate?.name),
    companyName: cleanText(candidate?.companyName),
    startupName: cleanText(candidate?.startupName),
    location: cleanText(candidate?.location),
    bio: cleanText(candidate?.bio).slice(0, 260),
    industries: candidateIndustries,
    heuristicScore: Number(candidate?.aiMatch?.score || 0),
  };
};

const parseJsonSafely = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const addHeuristicMetadata = (candidate, explanation = "Matched by heuristic industry relevance") => ({
  ...candidate,
  aiMatch: {
    ...(candidate?.aiMatch || {}),
    source: "heuristic",
    explanation,
    matchType:
      candidate?.aiMatch?.exactMatches?.length > 0
        ? "exact"
        : candidate?.aiMatch?.relatedMatches?.length > 0
          ? "related"
          : "weak",
  },
});

const rerankWithOpenAi = async ({ role, sourceIndustries, scoredCandidates, maxResults }) => {
  if (!process.env.OPEN_AI_API_KEY || !Array.isArray(scoredCandidates) || scoredCandidates.length === 0) {
    return null;
  }

  const shortlist = scoredCandidates.slice(0, AI_SHORTLIST_LIMIT);
  const candidatesForAi = shortlist.map((candidate) => buildOpenAiCandidatePayload(role, candidate));

  const systemPrompt =
    "You rank recommendation candidates for a startup platform. Prioritize exact industry matches first, then closely related industries. Return only JSON.";

  const userPrompt = JSON.stringify(
    {
      task: "Rank best matches",
      role,
      sourceIndustries,
      maxResults,
      rules: [
        "Exact industry match is highest priority",
        "Related industries are second priority",
        "Prefer stronger profile relevance",
        "Do not invent IDs",
      ],
      candidates: candidatesForAi,
      outputSchema: {
        rankedIds: ["string"],
        reasons: [{ id: "string", reason: "string", matchType: "exact|related|weak" }],
      },
    },
    null,
    2
  );

  try {
    const completionResult = await withTimeoutAndRetry({
      operation: "recommendation-rerank",
      timeoutMs: AI_TIMEOUT_MS,
      retries: AI_MAX_RETRIES,
      retryDelayMs: AI_RETRY_DELAY_MS,
      fn: () =>
        openai.chat.completions.create({
          model: AI_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
    });

    if (!completionResult.ok) {
      console.error(
        "OpenAI rerank failed, using heuristic fallback:",
        completionResult.error?.message || completionResult.error
      );
      return {
        rankedIds: [],
        reasonsMap: new Map(),
        source: "heuristic",
        fallback: true,
        reason: completionResult.timedOut ? "timeout" : "openai_error",
        attempts: completionResult.attempts,
      };
    }

    const content = completionResult.result?.choices?.[0]?.message?.content || "";
    const parsed = parseJsonSafely(content);
    const rankedIds = Array.isArray(parsed?.rankedIds)
      ? parsed.rankedIds.map((id) => String(id)).filter(Boolean)
      : [];

    if (rankedIds.length === 0) {
      return {
        rankedIds: [],
        reasonsMap: new Map(),
        source: "heuristic",
        fallback: true,
        reason: "invalid_openai_payload",
        attempts: completionResult.attempts,
      };
    }

    const reasonsMap = new Map();
    if (Array.isArray(parsed?.reasons)) {
      for (const reasonItem of parsed.reasons) {
        const id = String(reasonItem?.id || "");
        if (!id) continue;
        reasonsMap.set(id, {
          reason: cleanText(reasonItem?.reason),
          matchType: cleanText(reasonItem?.matchType).toLowerCase(),
        });
      }
    }

    return {
      rankedIds,
      reasonsMap,
      source: "openai",
      fallback: false,
      reason: null,
      attempts: completionResult.attempts,
    };
  } catch (error) {
    console.error("OpenAI rerank failed, using heuristic fallback:", error?.message || error);
    return {
      rankedIds: [],
      reasonsMap: new Map(),
      source: "heuristic",
      fallback: true,
      reason: "openai_exception",
      attempts: AI_MAX_RETRIES + 1,
    };
  }
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

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    let responseMeta = {
      source: "heuristic",
      fallback: false,
      reason: null,
      attempts: 0,
    };

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let sourceIndustries = [];
    let recommendations = [];

    if (user.role === "investor") {
      const investorProfile = await Investor.findOne({ userId });
      sourceIndustries = toIndustryList(investorProfile?.investmentInterests);
    } else if (user.role === "entrepreneur") {
      const entrepreneurProfile = await Entrepreneur.findOne({ userId });
      sourceIndustries = toIndustryList(entrepreneurProfile?.industry);
    } else {
      return res.status(400).json({ error: "User role must be investor or entrepreneur" });
    }

    const candidates = await fetchCandidatesForRole(user.role);

    const scored = candidates
      .map((candidate) => {
        const candidateIndustries = extractCandidateIndustries(user.role, candidate);

        const match = calculateMatch(sourceIndustries, candidateIndustries);

        return {
          ...candidate,
          aiMatch: {
            score: match.score,
            exactMatches: match.exactMatches,
            relatedMatches: match.relatedMatches,
          },
        };
      })
      .sort((a, b) => {
        if (b.aiMatch.score !== a.aiMatch.score) return b.aiMatch.score - a.aiMatch.score;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

    const strongMatches = scored.filter(
      (item) => item.aiMatch.exactMatches.length > 0 || item.aiMatch.relatedMatches.length > 0
    );

    const baseRanked = strongMatches.length > 0 ? strongMatches : scored;
    const openAiRank = await rerankWithOpenAi({
      role: user.role,
      sourceIndustries,
      scoredCandidates: baseRanked,
      maxResults: MAX_RECOMMENDATIONS,
    });

    if (openAiRank?.source) {
      responseMeta = {
        source: openAiRank.source,
        fallback: Boolean(openAiRank.fallback),
        reason: openAiRank.reason || null,
        attempts: Number(openAiRank.attempts || 0),
      };
    }

    if (openAiRank?.rankedIds?.length) {
      const byId = new Map(baseRanked.map((candidate) => [toCandidateId(candidate), candidate]));
      const selected = [];
      const seen = new Set();

      for (const id of openAiRank.rankedIds) {
        if (seen.has(id)) continue;
        const candidate = byId.get(id);
        if (!candidate) continue;

        seen.add(id);
        const reason = openAiRank.reasonsMap?.get(id);
        selected.push({
          ...candidate,
          aiMatch: {
            ...candidate.aiMatch,
            source: "openai",
            explanation: reason?.reason || "Matched by AI industry relevance",
            matchType: reason?.matchType || "related",
          },
        });

        if (selected.length >= MAX_RECOMMENDATIONS) break;
      }

      if (selected.length < MAX_RECOMMENDATIONS) {
        for (const candidate of baseRanked) {
          const id = toCandidateId(candidate);
          if (seen.has(id)) continue;
          selected.push(addHeuristicMetadata(candidate));
          seen.add(id);
          if (selected.length >= MAX_RECOMMENDATIONS) break;
        }
      }

      recommendations = selected;
    } else {
      recommendations = baseRanked
        .slice(0, MAX_RECOMMENDATIONS)
        .map((candidate) => addHeuristicMetadata(candidate));
    }

    res.json({
      success: true,
      recommendations,
      recommendationMeta: responseMeta,
    });
  } catch (error) {
    console.error("AI Recommendation Error:", error);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

export default router;
