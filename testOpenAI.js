import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config(); // load .env

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY
});

async function test() {
  try {
    // Simple test: Ask GPT to respond
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello to me!" }
      ]
    });

    console.log("GPT Response:", response.choices[0].message.content);

    // Optional: Simple Embedding Test
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: "Hello world"
    });
    console.log("Embedding vector length:", emb.data[0].embedding.length);

  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
