import mongoose from "mongoose";

const enterprenuerSchema = mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  startupName: String,
  pitchSummary: String,
  fundingNeeded: Number,
  industry: String,
  foundedYear: Number,
  teamSize: Number,
  revenue:Number,
  profitMargin:Number,
  growthRate:Number,
  marketOpportunity:String,
  advantage:String,
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
});

const Enterprenuer = mongoose.model("Enterpreneur", enterprenuerSchema);
export default Enterprenuer;
