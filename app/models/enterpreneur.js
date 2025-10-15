import mongoose from "mongoose";

const enterprenuerSchema = mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  startupName: String,
  pitchSummary: String,
  fundingNeeded: String,
  industry: String,
  foundedYear: Number,
  teamSize: Number,
  revenue:Number,
  profitMargin:Number,
  growthRate:Number,
  marketOpportunity:String,
  advantage:String,
});

const Enterprenuer = mongoose.model("Enterpreneur", enterprenuerSchema);
export default Enterprenuer;
