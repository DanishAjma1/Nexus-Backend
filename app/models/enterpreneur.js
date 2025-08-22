import mongoose from "mongoose";

const enterprenuerSchema = mongoose.Schema({
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
  fundingNeeded: String,
  industry: String,
  foundedYear: Number,
  teamSize: Number,
});

const Enterprenuer = mongoose.model("Enterpreneur", enterprenuerSchema);
export default Enterprenuer;
