import mongoose from "mongoose";

const collaborationSchema = mongoose.Schema({
  enter_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  inves_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  requestStatus: String,
  message: String,
  time: { type: Date, default: Date.now() },
});
const CollaborationRequest = mongoose.model(
  "CollaborationRequest",
  collaborationSchema
);
export default CollaborationRequest;
