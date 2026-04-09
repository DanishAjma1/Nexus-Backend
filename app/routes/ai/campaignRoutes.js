import express from "express";
import openai from "../../config/ai/openai.js";

const router = express.Router();

router.post("/generate-campaign", async (req, res) => {
  try {
    const { idea, category, goal } = req.body;

    if (!idea) {
      return res.status(400).json({ error: "Idea description is required" });
    }

    const systemPrompt = `You are an expert campaign strategist on the TrustBridge platform.You can also search the web or some refrences if You want.
    Your goal is to take a raw description of a campaign idea and generate THREE distinct, professional, and attractive title and description options.
    Focus on showing different value propositions or tones for the same idea to give the user variety.
    
    Constraints for EACH option:
    - TITLE: Must contain ONLY letters and spaces. No numbers or special characters.
    - DESCRIPTION: Must be between 50 and 150 words long. Detail is key. Use only letters, numbers, and basic punctuation (., !).
    
    Always return your response as a JSON object containing an array called 'options'. Each item in the array must have its own 'title' and 'description' fields.
    The total number of options must be exactly 3.
    The category is: ${category || "General"}
    The goal amount is: ${goal || "TBD"}
    `;

    const userPrompt = `Campaign idea: "${idea}"\nPlease generate 3 professional title and description options for this campaign.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    res.json({ success: true, options: result.options });
  } catch (error) {
    console.error("Campaign AI Error:", error);
    res.status(500).json({ error: "Failed to generate campaign content" });
  }
});

export default router;
