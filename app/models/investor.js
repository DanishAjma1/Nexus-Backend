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
  maxTimline: Number,
  access: { type: String, default: false },
});

const Investor = mongoose.model("Investor", investorSchema);
export default Investor;
