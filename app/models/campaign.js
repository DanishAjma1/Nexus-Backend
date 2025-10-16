import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    createdBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: false,
},

    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    goalAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    raisedAmount: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      enum: ["Technology", "Health", "Education", "Environment", "Other"],
      default: "Other",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "active", "completed"],
      default: "pending",
    },
    images: [
      {
        type: String, // stores uploaded file paths
      },
    ],
    supporters: [
      {
        supporterId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        amount: Number,
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;
