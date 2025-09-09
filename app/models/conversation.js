import mongoose from "mongoose";

const conversationScehma = mongoose.Schema({
  senderId: String,
  participants: [
    {
      receiverId: { type: String, required: true },
      lastMessage: { type: Object },
    },
  ],
  lastModified: {
    type: Date,
    default: Date.now,
  },
});

const Conversation = mongoose.model("Conversation", conversationScehma);
export default Conversation;
