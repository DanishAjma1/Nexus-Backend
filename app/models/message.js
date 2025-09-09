import mongoose from "mongoose";

const messageSchema = mongoose.Schema({
  senderId: String,
  receiverId: String,
  content: String,
  isRead: Boolean,
  time: {
    type: Date,
    default: Date.now,
  },
});

const Message = mongoose.model("Message", messageSchema);
export default Message;
