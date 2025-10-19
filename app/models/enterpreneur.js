import mongoose from "mongoose";

const entrepreneurSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  startupName: String,
  pitchSummary: String,
  fundingNeeded: Number,
  industry: String,
  foundedYear: Number,
  teamSize: Number,
  revenue: Number,
  profitMargin: Number,
  growthRate: Number,
  marketOpportunity: String,
  advantage: String,
});

const Enterpreneurs = mongoose.model("Enterpreneurs", entrepreneurSchema);
export default Enterpreneurs;
