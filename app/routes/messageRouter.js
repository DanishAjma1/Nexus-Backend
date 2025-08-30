import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection";
import Message from "../models/message";

messageRouter = Router();

messageRouter.get("/get-messages-btw-users", async (req, res) => {
  try {
    await connectDB();
    const { sender, receiver } = req.query;
    const filter = { senderId: sender, receiverId: receiver };
    const messages = await Message.find(filter);
    res.status(200).json({ messages });
  } catch (error) {
    res.status(400).json(error.message);
  }
});

messageRouter.post("/save-messages-btw-users", async (req, res) => {
  try {
    await connectDB();
    const {messages} = req.body;
    const message = await new Message(messages);
    await message.save();
    res.status(200).json({ messages });
  } catch (error) {
    res.status(400).json(error.message);
  }
});

export default messageRouter;