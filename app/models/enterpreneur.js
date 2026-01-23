import mongoose from "mongoose";

const enterprenuerSchema = mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  startupName: String,
  pitchSummary: String,
  fundingNeeded: Number,
  industry: [String],
  foundedYear: Number,
  teamSize: Number,
  revenue:Number,
  profitMargin:Number,
  growthRate:Number,
  marketOpportunity:String,
  advantage:String,
  valuation: { type: Number, default: 0 },
  preSeedStatus: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
  seedStatus: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
  seriesAStatus: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
  // Approval Fields
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  team: [
    {
      name: String,
      role: [String],
      avatarUrl: String,
    }
  ],
  fundingHistory: [
    {
      amount: Number,
      stage: String,
      year: Number,
      date: { type: Date, default: Date.now }
    }
  ],
  businessThumbnails: { type: [String], default: [] },
});

const Enterprenuer = mongoose.model("Enterpreneur", enterprenuerSchema);
export default Enterprenuer;
