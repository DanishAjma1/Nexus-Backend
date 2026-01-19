import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection.js";
import Deal from "../models/deal.js";
import User from "../models/user.js";
import Notification from "../models/notification.js";

const dealRouter = Router();

// Create a new deal
dealRouter.post("/create-deal", async (req, res) => {
  try {
    await connectDB();
    const {
      investorId,
      entrepreneurId,
      ...dealData
    } = req.body;

    const newDeal = new Deal({
      investorId,
      entrepreneurId,
      ...dealData,
      lastActionBy: 'investor'
    });

    await newDeal.save();

    // Notify Entrepreneur
    const notification = new Notification({
      recipient: entrepreneurId,
      sender: investorId,
      message: `You have received a new investment proposal!`,
      type: "deal_offer",
      link: `/deals/view-deals` 
    });
    await notification.save();

    res.status(201).json({ message: "Deal proposal sent successfully!", deal: newDeal });
  } catch (error) {
    console.error("Error creating deal:", error);
    res.status(500).json({ message: "Failed to create deal proposal." });
  }
});

// Update deal (Negotiate, Accept, Reject)
dealRouter.put("/update-deal/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { action, note, updatedTerms, role } = req.body; 
    // role: 'investor' or 'entrepreneur'
    // action: 'accept', 'reject', 'negotiate'

    const deal = await Deal.findById(id);
    if (!deal) return res.status(404).json({ message: "Deal not found" });

    if (action === "negotiate") {
      deal.status = "negotiating";
      deal.negotiationHistory.push({
        actionBy: role,
        message: note,
        proposedTerms: updatedTerms,
      });
      deal.lastActionBy = role;
      
      // Notify the other party
      const recipientId = role === 'investor' ? deal.entrepreneurId : deal.investorId;
      const notification = new Notification({
        recipient: recipientId,
        sender: role === 'investor' ? deal.investorId : deal.entrepreneurId,
        message: `New counter-offer received for deal with ${deal.entrepreneurId.startupName}`,
        type: "deal_negotiation",
        link: role === 'investor' ? `/deals/sent-deals` : `/deals/view-deals`
      });
      await notification.save();

    } else if (action === "accept") {
      // If accepting a negotiation, apply the proposed terms
      if (deal.status === 'negotiating' && deal.negotiationHistory.length > 0) {
          const latestProposal = deal.negotiationHistory[deal.negotiationHistory.length - 1];
          // Determine if we should apply these terms. 
          // If I am accepting, I am accepting the LAST proposal made by the OTHER party.
          // Which should allow us to merge proposedTerms into the deal.
          if (latestProposal && latestProposal.proposedTerms) {
              Object.assign(deal, latestProposal.proposedTerms);
          }
      }

      deal.status = "accepted";
      deal.lastActionBy = role;
      
      const notification = new Notification({
        recipient: role === 'investor' ? deal.entrepreneurId : deal.investorId,
        sender: role === 'investor' ? deal.investorId : deal.entrepreneurId,
        message: `Deal accepted!`,
        type: "deal_accepted",
        link: role === 'investor' ? `/deals/sent-deals` : `/deals/view-deals`
      });
      await notification.save();

    } else if (action === "reject") {
      deal.status = "rejected";
      deal.lastActionBy = role;
      
      const notification = new Notification({
        recipient: role === 'investor' ? deal.entrepreneurId : deal.investorId,
        sender: role === 'investor' ? deal.investorId : deal.entrepreneurId,
        message: `Deal rejected.`,
        type: "deal_rejected",
        link: role === 'investor' ? `/deals/sent-deals` : `/deals/view-deals`
      });
      await notification.save();
    }

    await deal.save();

    res.status(200).json({ message: "Deal updated successfully", deal });
  } catch (error) {
    console.error("Error updating deal:", error);
    res.status(500).json({ message: "Failed to update deal." });
  }
});

// Get all deals (Admin)
dealRouter.get("/get-all-deals", async (req, res) => {
  try {
    await connectDB();
    
    const deals = await Deal.find({})
    .populate('investorId', 'name email avatarUrl')
    .populate('entrepreneurId', 'name email avatarUrl startupName')
    .sort({ createdAt: -1 });

    res.status(200).json(deals);
  } catch (error) {
    console.error("Error fetching all deals:", error);
    res.status(500).json({ message: "Failed to fetch deals." });
  }
});

// Get deals involved with a user
dealRouter.get("/get-deals/:userId", async (req, res) => {
  try {
    await connectDB();
    const { userId } = req.params;
    
    const deals = await Deal.find({
      $or: [{ investorId: userId }, { entrepreneurId: userId }]
    })
    .populate('investorId', 'name email avatarUrl')
    .populate('entrepreneurId', 'name email avatarUrl startupName')
    .sort({ createdAt: -1 });

    res.status(200).json(deals);
  } catch (error) {
    console.error("Error fetching deals:", error);
    res.status(500).json({ message: "Failed to fetch deals." });
  }
});

export default dealRouter;

