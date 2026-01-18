import mongoose from "mongoose";

const dealSchema = mongoose.Schema({
  investorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  entrepreneurId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
  // Investment Terms
  investmentAmount: { type: Number, required: true },
  equityOffered: { type: Number, required: true }, // percentage
  preMoneyValuation: { type: Number, required: true },
  postMoneyValuation: { type: Number, required: true },
  investmentType: { 
    type: String, 
    enum: ['Equity', 'Convertible Note', 'SAFE', 'Debt'], 
    required: true 
  },
  stage: {
    type: String,
    enum: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Late Stage'],
    default: 'Seed'
  },

  // Investor Rights & Preferences
  boardSeat: { type: String, enum: ['Yes', 'No'], default: 'No' },
  votingRights: { type: String, enum: ['Full', 'Limited', 'None'], default: 'None' },
  dividends: { type: String, enum: ['Yes', 'No', 'On Exit Only'], default: 'On Exit Only' },
  rofr: { type: String, enum: ['Yes', 'No'], default: 'No' }, // Right of First Refusal

  // Exit Strategy
  exitStrategy: { type: String, enum: ['IPO', 'Acquisition', 'Buyback', 'Other'] },
  exitTimeline: { type: String }, // e.g., "3-5 years"

  // Additional
  additionalTerms: { type: String },

  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected', 'negotiating'], 
    default: 'pending' 
  },
  
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'funds_released'],
    default: 'unpaid'
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DealTransaction"
  },

  negotiationHistory: [{
    actionBy: { type: String, enum: ['investor', 'entrepreneur'] },
    message: String,
    proposedTerms: { type: Object }, // Snapshot of changed terms
    date: { type: Date, default: Date.now }
  }],

  lastActionBy: { type: String, enum: ['investor', 'entrepreneur'] }
}, { timestamps: true });

const Deal = mongoose.model("Deal", dealSchema);
export default Deal;
