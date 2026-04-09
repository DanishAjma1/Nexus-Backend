import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY
});

async function checkModels() {
  try {
    const list = await openai.models.list();
    console.log("Successfully connected! Available models found:", list.data.length);
    const hasGPT4 = list.data.some(m => m.id.includes("gpt-4o-mini"));
    console.log("Has gpt-4o-mini access:", hasGPT4);
    
    // Try small completion with gpt-4o-mini
    console.log("Testing gpt-4o-mini...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });
    console.log("Success:", completion.choices[0].message.content);

  } catch (err) {
    console.error("DEBUG ERROR:", err.message);
    if (err.status === 429) {
       console.log("CONFIRMED: This is a 429 Quota Error. The key is valid, but the account HAS NO CREDIT for Chat models.");
    }
  }
}

checkModels();
