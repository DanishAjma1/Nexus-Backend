import mongoose from "mongoose";

const conversationScehma = mongoose.Schema({
  senderId: String,
  reveiverId: String,
  receiverName: String,
});

const Conversation = mongoose.model("Conversation", conversationScehma);
export default Conversation;
