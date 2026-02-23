import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection.js";
import Deal from "../models/deal.js";
import User from "../models/user.js";
import Notification from "../models/notification.js";
import DealTransaction from "../models/dealTransaction.js";
import { emitNotification } from "../utils/notificationEmitter.js";

const dealRouter = Router();

// Lead time in days before contract end to notify
const CONTRACT_END_LEAD_DAYS = 30;

async function checkContractsAndNotify() {
  try {
    await connectDB();
    const now = new Date();
    const cutoff = new Date(now.getTime() + CONTRACT_END_LEAD_DAYS * 24 * 60 * 60 * 1000);

    const deals = await Deal.find({
      contractEndDate: { $exists: true, $ne: null, $lte: cutoff },
      contractEndNotified: false,
    }).populate('investorId', 'name').populate('entrepreneurId', 'startupName name');

    for (const deal of deals) {
      const daysLeft = Math.ceil((deal.contractEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const investorMsg = `Contract for ${deal.entrepreneurId?.startupName || 'the startup'} is ending in ${daysLeft} day(s).`;
      const entrepreneurMsg = `Contract with ${deal.investorId?.name || 'an investor'} is ending in ${daysLeft} day(s).`;

      const n1 = new Notification({ recipient: deal.investorId._id || deal.investorId, sender: deal.entrepreneurId._id || deal.entrepreneurId, message: investorMsg, type: 'contract_ending', link: `/deals/view-deals` });
      const n2 = new Notification({ recipient: deal.entrepreneurId._id || deal.entrepreneurId, sender: deal.investorId._id || deal.investorId, message: entrepreneurMsg, type: 'contract_ending', link: `/deals/view-deals` });
      await n1.save();
      await n2.save();
      await emitNotification(n1);
      await emitNotification(n2);

      deal.contractEndNotified = true;
      await deal.save();
    }
  } catch (err) {
    console.error('Error checking contract end notifications:', err);
  }
}

// Run check on startup and then daily
setTimeout(() => { checkContractsAndNotify(); }, 5 * 1000);
setInterval(() => { checkContractsAndNotify(); }, 24 * 60 * 60 * 1000);

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
    await emitNotification(notification);

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
          link: role === 'investor' ? `/deals/view-deals` : `/deals/sent-deals`
      });
      await notification.save();
      await emitNotification(notification);

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
         link: role === 'investor' ? `/deals/view-deals` : `/deals/sent-deals`
      });
      await notification.save();
      await emitNotification(notification);

    } else if (action === "reject") {
      deal.status = "rejected";
      deal.lastActionBy = role;
      
      const notification = new Notification({
        recipient: role === 'investor' ? deal.entrepreneurId : deal.investorId,
        sender: role === 'investor' ? deal.investorId : deal.entrepreneurId,
        message: `Deal rejected.`,
        type: "deal_rejected",
        link: role === 'investor' ? `/deals/view-deals` : `/deals/sent-deals`
      });
      await notification.save();
      await emitNotification(notification);

    } else if (action === "cancel") {
      // Distinct handling for investor cancellation
      deal.status = "cancelled";
      deal.lastActionBy = role;

      const notification = new Notification({
        recipient: role === 'investor' ? deal.entrepreneurId : deal.investorId,
        sender: role === 'investor' ? deal.investorId : deal.entrepreneurId,
        message: `Deal cancelled by ${role}.`,
        type: "deal_cancelled",
        link: role === 'investor' ? `/deals/view-deals` : `/deals/sent-deals`
      });
      await notification.save();
      await emitNotification(notification);
    }

    // If deal has been accepted and payment already released, ensure contract end date is set
    if (deal.status === 'accepted' && deal.paymentStatus === 'funds_released' && !deal.contractEndDate) {
      const years = deal.contractDurationYears || 1;
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + Number(years));
      deal.contractEndDate = endDate;
      deal.contractEndNotified = false;
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

// Get transaction receipt for a deal
dealRouter.get("/get-transaction/:dealId", async (req, res) => {
  try {
    await connectDB();
    const { dealId } = req.params;

    // Get all transactions for this deal (original + additional investments)
    const transactions = await DealTransaction.find({ dealId })
      .sort({ createdAt: 1 }) // Oldest first (original investment first)
      .populate("investorId", "name email")
      .populate("entrepreneurId", "name email startupName");

    const deal = await Deal.findById(dealId);

    if (!transactions || transactions.length === 0 || !deal) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.status(200).json({ transactions, deal });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).json({ message: "Failed to fetch transaction." });
  }
});

// Update payment status (used by payment flow). Also computes contract end date when final payment released.
dealRouter.put('/set-payment-status/:id', async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { paymentStatus } = req.body;

    const deal = await Deal.findById(id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });

    deal.paymentStatus = paymentStatus;

    if (paymentStatus === 'funds_released' && deal.status === 'accepted' && !deal.contractEndDate) {
      const years = deal.contractDurationYears || 1;
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + Number(years));
      deal.contractEndDate = endDate;
      deal.contractEndNotified = false;
    }

    await deal.save();
    res.status(200).json({ message: 'Payment status updated', deal });
  } catch (err) {
    console.error('Error updating payment status:', err);
    res.status(500).json({ message: 'Failed to update payment status' });
  }
});

export default dealRouter;

