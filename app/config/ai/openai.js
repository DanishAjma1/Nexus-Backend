import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.OPEN_AI_API_KEY) {
  console.warn("WARNING: OPEN_AI_API_KEY is not defined in the environment variables.");
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

export default openai;
