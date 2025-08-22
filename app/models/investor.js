import mongoose from "mongoose";

const investorSchema = mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  avatarUrl: String,
  location: String,
  bio: String,
  isOnline: Boolean,
  investmentInterests: Array,
  investmentStage: Array,
  portfolioCompanies: Array,
  totalInvestments: Number,
  minimumInvestment: String,
  maximumInvestment: String,
});

const Investor = mongoose.model("Investor", investorSchema);
export default Investor;
