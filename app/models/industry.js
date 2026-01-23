import mongoose from "mongoose";

const industrySchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  isCustom: {
    type: Boolean,
    default: true,
  },
  recommended: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Industry = mongoose.model("Industry", industrySchema);
export default Industry;
