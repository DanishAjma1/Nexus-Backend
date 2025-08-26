import mongoose from "mongoose";

const investorSchema = mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  investmentInterests: Array,
  investmentStage: Array,
  portfolioCompanies: Array,
  totalInvestments: Number,
  minimumInvestment: String,
  maximumInvestment: String,
});

const Investor = mongoose.model("Investor", investorSchema);
export default Investor;
