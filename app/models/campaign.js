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
    organizer: {
      type: String,
      required: false,
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
      required: false,
    },
    isLifetime: {
        type: Boolean,
        default: false,
    },
    category: {
      type: String,
      enum: ["Technology", "Health", "Education", "Environment", "Other"],
      default: "Other",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "active", "completed", "deleted"],
      default: "pending",
    },
    images: [
      {
        type: String, // stores uploaded file paths
      },
    ],
    video: {
      type: String, // stores uploaded video path
      required: false,
    },
    supporters: [
      {
        supporterId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        guestId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Supporter",
          required: false,
        },
        isGuest: {
          type: Boolean,
          default: false,
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
