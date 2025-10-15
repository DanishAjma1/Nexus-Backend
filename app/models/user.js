import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  avatarUrl: String,
  location: String,
  bio: String,
  isOnline: { type: Boolean, default: false },
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

  
  lastLoginTime: { type: Date },
  lastLogoutTime: { type: Date },
  totalSessionDuration: { type: Number, default: 0 }, 
lastLogoutDuration: { type: Number, default: 0 },

}); 


const User = mongoose.model("User", UserSchema);
export default User;
