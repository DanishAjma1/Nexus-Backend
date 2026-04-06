import mongoose from "mongoose";

const investorSchema = mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  investmentInterests: Array,
  portfolioCompanies: Array,
  totalInvestments: Number,
  minimumInvestment: String,
  maximumInvestment: String,
  investmentCriteria: Array,
  successfullExits: Number,
  minTimline: Number,
  maxTimline: Date,
  access: { type: String, default: false },
  // Approval Fields
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
});

const Investor = mongoose.model("Investor", investorSchema);
export default Investor;
