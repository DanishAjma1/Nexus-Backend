import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection";
import Conversation from "../models/conversation";

const conversationRouter = Router();

conversationRouter.get("/get-conversations-for-user", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const filter = { senderId: id };
    const conversations = await Conversation.find(filter);
    res.status(200).json({conversations});
  } catch (error) {
    res.status(400).json(error.message);
  }
});

export default conversationRouter;
