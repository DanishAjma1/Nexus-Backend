import Campaign from "../models/campaign.js";
import { connectDB } from "../config/mongoDBConnection.js";

/**
 * Background task to check for expired campaigns and mark them as completed.
 * Ignores campaigns marked as 'isLifetime'.
 */
export const checkExpiredCampaigns = async () => {
  try {
    await connectDB();
    const now = new Date();

    // Find active campaigns that are NOT lifetime and have passed their end date
    const expiredCampaigns = await Campaign.find({
      status: "active",
      isLifetime: { $ne: true },
      endDate: { $lte: now }
    });

    if (expiredCampaigns.length === 0) {
      return;
    }

    console.log(`[CampaignChecker] Found ${expiredCampaigns.length} expired campaigns. Processing...`);

    for (const campaign of expiredCampaigns) {
      try {
        campaign.status = "completed";
        await campaign.save();
        
        console.log(`[CampaignChecker] Campaign "${campaign.title}" (${campaign._id}) marked as completed.`);
      } catch (err) {
        console.error(`[CampaignChecker] Error updating campaign ${campaign._id}:`, err);
      }
    }
  } catch (error) {
    console.error("[CampaignChecker] Error in background task:", error);
  }
};

/**
 * Starts the campaign checker interval.
 * Runs every hour by default.
 */
export const startCampaignChecker = () => {
  // Run once on startup
  checkExpiredCampaigns();
  
  const INTERVAL = 15 * 60 * 1000;
  setInterval(checkExpiredCampaigns, INTERVAL);
  
  console.log(`[CampaignChecker] Background task started. Interval: ${INTERVAL / 1000 / 60} seconds.`);
};
