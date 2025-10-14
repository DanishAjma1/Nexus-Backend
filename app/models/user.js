import mongoose from "mongoose";

const UserSchema = mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  avatarUrl: String,
  location: String,
  bio: String,
  isOnline: Boolean,
  startupName: String,
  pitchSummary: String,
  fundingNeeded: Number,
  industry: String,
  foundedYear: Number,
  teamSize: Number,
  investmentInterests: Array,
  investmentStage: Array,
  portfolioCompanies: Array,
  totalInvestments: Number,
  minimumInvestment: String,
  maximumInvestment: String,
});

const User = mongoose.model("User", UserSchema);
export default User;
