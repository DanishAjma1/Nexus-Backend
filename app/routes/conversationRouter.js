import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection.js";
import Conversation from "../models/conversation.js";

const conversationRouter = Router();

conversationRouter.get("/get-conversations-for-user", async (req, res) => {
  let updateConversationMessage = null;
  try {
    await connectDB();
    const { currentUserId, partnerId } = req.query;
    const filter = { senderId: currentUserId };
    const conversation = await Conversation.findOne(filter);

    if (conversation) {
      const updatedConversationIndex = conversation.participants.findIndex(
        (part) => {
          return part.receiverId === partnerId;
        }
      );

      if (updatedConversationIndex !== -1) {
        updateConversationMessage = {
          ...conversation.participants[updatedConversationIndex].lastMessage,
          isRead: true,
        };
        conversation.participants[updatedConversationIndex].lastMessage = updateConversationMessage;
      }
    }
    await conversation.save();
    res.status(200).json({ conversation });
  } catch (error) {
    res.status(400).json(error.message);
  }
});

conversationRouter.post("/update-conversations-for-user", async (req, res) => {
  try {
    await connectDB();
    const { sender, receiver, lastMessage } = req.body;

    const filterForSender = { senderId: sender };
    const filterForReceiver = { senderId: receiver };

    let conversationForSender = await Conversation.findOne(filterForSender);
    let conversationForReceiver = await Conversation.findOne(filterForReceiver);

    if (!conversationForSender) {
      // Create a new conversationForSender
      conversationForSender = new Conversation({
        senderId: sender,
        participants: [{ receiverId: receiver, lastMessage }],
      });
    } else {
      // Update existing conversation
      const senderIndex = conversationForSender.participants.findIndex(
        (partner) => partner.receiverId === receiver
      );
      if (senderIndex === -1) {
        conversationForSender.participants.push({
          receiverId: receiver,
          lastMessage,
        });
      } else {
        const updatedLastMessage = { ...lastMessage, time: Date.now() };
        conversationForSender.participants[senderIndex].lastMessage =
          updatedLastMessage;
      }
    }

    if (!conversationForReceiver) {
      // Create a new conversation For Receiver
      conversationForReceiver = new Conversation({
        senderId: receiver,
        participants: [{ receiverId: sender, lastMessage }],
      });
    } else {
      // Update existing conversation For Receiver
      const receiverIndex = conversationForReceiver.participants.findIndex(
        (partner) => partner.receiverId === sender
      );
      if (receiverIndex === -1) {
        conversationForReceiver.participants.push({
          receiverId: sender,
          lastMessage,
        });
      } else {
        const updatedLastMessage = { ...lastMessage, time: Date.now() };
        conversationForReceiver.participants[receiverIndex].lastMessage =
          updatedLastMessage;
      }
    }

    await conversationForSender.save();
    await conversationForReceiver.save();
    res.status(200).json({ conversationForSender });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default conversationRouter;
