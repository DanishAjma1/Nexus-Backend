import mongoose from "mongoose";

const dealTransactionSchema = new mongoose.Schema(
  {
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deal",
      required: true,
    },
    investorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    entrepreneurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    investorName: {
      type: String,
      required: true,
    },
    entrepreneurName: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentIntentId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "released"], // released means admin sent funds to entrepreneur
      default: "pending",
    },
    stripeFee: {
        type: Number
    },
    platformCommission: {
        type: Number,
        default: 0
    },
    netAmount: {
        type: Number,
        default: 0
    },
    isAdditionalInvestment: {
        type: Boolean,
        default: false
    },
    adminActionDate: {
        type: Date
    }
  },
  { timestamps: true }
);

const DealTransaction = mongoose.model("DealTransaction", dealTransactionSchema);
export default DealTransaction;
