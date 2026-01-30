import mongoose from "mongoose";

const RiskEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      "failed_login",
      "multiple_time_failed_login",
      "multiple_withdraw_attempts",
      "unapproved_login_attempt",
      "suspicious_email",
      "abnormal_pattern",
      "other",
    ],
  },

  email: {
    type: String,
    required: true,
  },

  riskScore: { type: Number, default: 0 },
  isFraud: { type: Boolean, default: false },
  reason: { type: String, default: "" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  createdAt: { type: Date, default: Date.now, index: true },
});

const RiskEvent = mongoose.model("RiskEvent", RiskEventSchema);
export default RiskEvent;
