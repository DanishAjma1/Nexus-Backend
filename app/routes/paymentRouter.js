import { Router } from "express";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import { connectDB } from "../config/mongoDBConnection.js";
import Campaign from "../models/campaign.js";
import Transaction from "../models/transaction.js";
import User from "../models/user.js";
import Supporter from "../models/supporter.js";
import Deal from "../models/deal.js";
import DealTransaction from "../models/dealTransaction.js";
import Notification from "../models/notification.js";
import Card from "../models/card.js";
import Enterpreneur from "../models/enterpreneur.js";
import { sendAdminPaymentNotification } from "../utils/paymentMailService.js";

const paymentRouter = Router();

// Use the exact names from .env
const stripe = new Stripe(process.env.Sripe_Secret_key);

// Middleware to optionally get user from token
const getUserIfAvailable = async (req) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded._id;

    await connectDB();
    const user = await User.findById(userId);
    return user;
  } catch (error) {
    return null;
  }
};

// Create Payment Intent
paymentRouter.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, campaignId, guestName, guestPhone, guestEmail } = req.body;
    const user = await getUserIfAvailable(req);

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    if (!user && (!guestName || !guestPhone || !guestEmail)) {
      return res
        .status(400)
        .json({ message: "Guest details required if not logged in" });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const metadata = {
      campaignId: campaignId.toString(),
      campaignTitle: campaign.title,
    };

    if (user) {
      metadata.userId = user._id.toString();
    } else {
      metadata.guestName = guestName;
      metadata.guestPhone = guestPhone;
      metadata.guestEmail = guestEmail;
      metadata.isGuest = "true";
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects cents
      currency: "usd",
      metadata: metadata,
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Stripe Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Confirm and save transaction
paymentRouter.post("/confirm-payment", async (req, res) => {
  try {
    await connectDB();
    // const { campaignId, amount, paymentIntentId, guestName, guestPhone, guestEmail } = req.body;
    const { paymentIntentId } = req.body;

    //  1. VERIFY PAYMENT FROM STRIPE (ADD THIS)
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return res
        .status(400)
        .json({ message: "Payment not verified by Stripe" });
    }

    // 2. READ CAMPAIGN FROM STRIPE METADATA (TRUST STRIPE, NOT FRONTEND)
    const campaignId = paymentIntent.metadata.campaignId;
    const amount = paymentIntent.amount_received / 100;

    const { guestName, guestPhone, guestEmail } = req.body;
    const user = await getUserIfAvailable(req);

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    let transactionData = {
      campaignId: campaignId,
      campaignTitle: campaign.title,
      amount: amount,
      paymentIntentId: paymentIntentId,
      status: "succeeded",
    };
    console.log(transactionData);
    let supporterId;
    let isGuest = false;

    if (user) {
      transactionData.userId = user._id;
      transactionData.userName = user.name;
      supporterId = user._id;
    } else {
      if (!guestName || !guestPhone || !guestEmail) {
        return res
          .status(400)
          .json({ message: "Guest details missing for confirmation" });
      }

      // Create or find supporter
      let supporter = await Supporter.findOne({
        $or: [{ phoneNumber: guestPhone }, { email: guestEmail }],
      });

      if (!supporter) {
        supporter = new Supporter({
          name: guestName,
          phoneNumber: guestPhone,
          email: guestEmail,
        });
        await supporter.save();
      } else {
        // Update details if changed
        supporter.name = guestName;
        supporter.phoneNumber = guestPhone;
        supporter.email = guestEmail;
        await supporter.save();
      }

      transactionData.supporterId = supporter._id;
      transactionData.userName = guestName;
      supporterId = supporter._id;
      isGuest = true;
    }

    // Create transaction record
    const transaction = new Transaction(transactionData);
    await transaction.save();

    // Update campaign raised amount and supporters
    campaign.raisedAmount += Number(amount);

    // Check if supporter already exists in campaign
    let existingSupporterIndex = -1;

    if (isGuest) {
      existingSupporterIndex = campaign.supporters.findIndex(
        (s) => s.guestId && s.guestId.toString() === supporterId.toString(),
      );
    } else {
      existingSupporterIndex = campaign.supporters.findIndex(
        (s) =>
          s.supporterId && s.supporterId.toString() === supporterId.toString(),
      );
    }

    if (existingSupporterIndex > -1) {
      campaign.supporters[existingSupporterIndex].amount += Number(amount);
      campaign.supporters[existingSupporterIndex].date = Date.now();
    } else {
      const newSupporter = {
        amount: Number(amount),
        date: Date.now(),
        isGuest: isGuest,
      };

      if (isGuest) {
        newSupporter.guestId = supporterId;
      } else {
        newSupporter.supporterId = supporterId;
      }

      campaign.supporters.push(newSupporter);
    }

    await campaign.save();

    res.status(200).json({
      message: "Payment confirmed and recorded",
      transaction,
    });
  } catch (error) {
    console.error("Confirmation Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get all donations/supporters for admin
paymentRouter.get("/all-donations", async (req, res) => {
  try {
    await connectDB();

    // Fetch all successful transactions
    const transactions = await Transaction.find({ status: "succeeded" })
      .populate("userId", "name email")
      .populate("supporterId", "name email phoneNumber")
      .populate("campaignId", "title")
      .sort({ createdAt: -1 });

    const formattedDonations = transactions.map((tx) => {
      if (tx.userId) {
        return {
          id: tx._id,
          name: tx.userId.name,
          email: tx.userId.email,
          phone: "N/A (Registered)",
          campaign: tx.campaignId ? tx.campaignId.title : "Deleted Campaign",
          amount: tx.amount,
          date: tx.createdAt,
          type: "User",
        };
      } else if (tx.supporterId) {
        return {
          id: tx._id,
          name: tx.supporterId.name,
          email: tx.supporterId.email,
          phone: tx.supporterId.phoneNumber,
          campaign: tx.campaignId ? tx.campaignId.title : "Deleted Campaign",
          amount: tx.amount,
          date: tx.createdAt,
          type: "Guest",
        };
      } else {
        return {
          id: tx._id,
          name: tx.userName || "Unknown",
          email: "N/A",
          phone: "N/A",
          campaign: tx.campaignId ? tx.campaignId.title : "Deleted Campaign",
          amount: tx.amount,
          date: tx.createdAt,
          type: "Guest (Legacy)",
        };
      }
    });

    res.status(200).json(formattedDonations);
  } catch (error) {
    console.error("Fetch Donations Error:", error);
    res.status(500).json({ message: error.message });
  }
});

paymentRouter.post("/create-deal-payment-intent", async (req, res) => {
    try {
        const { dealId, amount } = req.body;
        const user = await getUserIfAvailable(req);
        
        if (!user) return res.status(401).json({ message: "Unauthorized" });

        const deal = await Deal.findById(dealId).populate('entrepreneurId', 'name');
        if (!deal) return res.status(404).json({ message: "Deal not found" });

        // Backend validation: Investor cannot pay LESS than accepted amount
        // They can pay MORE (maybe to cover fees, etc, though usually it's exact)
        // User requested: "investor can not enter amount less then the accpeted investment he can increase"
        if (amount < deal.investmentAmount) {
             return res.status(400).json({ message: `Payment amount cannot be less than agreed investment ($${deal.investmentAmount})` });
        }

        const metadata = {
            dealId: dealId,
            investorId: user._id.toString(),
            investorName: user.name,
            entrepreneurId: deal.entrepreneurId.toString(),
            entrepreneurName: deal.entrepreneurId.name,
            type: 'deal_payment'
        };

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: "usd",
            metadata: metadata,
        });

        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
        });

    } catch (error) {
        console.error("Stripe Deal Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// Confirm Deal Payment
paymentRouter.post("/confirm-deal-payment", async (req, res) => {
    try {
        await connectDB();
        const { paymentIntentId, dealId } = req.body;

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== "succeeded") {
            return res.status(400).json({ message: "Payment not verified by Stripe" });
        }

        // Verify metadata matches to prevent cross-usage
        if (paymentIntent.metadata.type !== 'deal_payment' || paymentIntent.metadata.dealId !== dealId) {
             return res.status(400).json({ message: "Invalid payment intent for this deal" });
        }

        const deal = await Deal.findById(dealId).populate('investorId').populate('entrepreneurId');
        if (!deal) return res.status(404).json({ message: "Deal not found" });

        const existingTransaction = await DealTransaction.findOne({ paymentIntentId });
        if (existingTransaction) {
            return res.status(200).json({ message: "Transaction already recorded", transaction: existingTransaction });
        }

        const amount = paymentIntent.amount_received / 100;
        
        // Create Transaction Record
        const transaction = new DealTransaction({
            dealId: dealId,
            investorId: deal.investorId._id,
            entrepreneurId: deal.entrepreneurId._id,
            amount: amount,
            paymentIntentId: paymentIntentId,
            status: "succeeded",
            stripeFee: 0 // Ideally calculating fee from stripe balance transaction if needed
        });
        await transaction.save();

        // Update Deal
        deal.paymentStatus = 'paid';
        deal.transactionId = transaction._id;
        await deal.save();

        // Notify Admin (Global notification or just log for now, user asked for email/app notification)
        // We will add app notification for admin
        // Find Admins? Or just send to a general admin channel? 
        // For now, let's notify the Entrepreneur that funds are secured and pending release.
        
        // Notify Entrepreneur
        const notifEnt = new Notification({
            recipient: deal.entrepreneurId._id,
            sender: deal.investorId._id,
            message: `Investment payment of $${amount} received! Funds are subject to admin approval before release.`,
            type: "deal_accepted", // Reusing type or add new one
            link: `/dashboard/entrepreneur` 
        });
        await notifEnt.save();

        // Notify Investor
         const notifInv = new Notification({
            recipient: deal.investorId._id, // Self check?
            sender: deal.investorId._id,
            message: `Payment of $${amount} for ${deal.entrepreneurId.startupName} successful. Waiting for admin processing.`,
            type: "deal_accepted",
            link: `/deals/sent-deals`
        });
        await notifInv.save();
        
        // Notify Admins
        const admins = await User.find({ role: 'admin' });
        
        // 1. In-App Notification for ALL Admins
        const adminNotifications = admins.map(admin => ({
            recipient: admin._id,
            sender: deal.investorId._id,
            message: `New Payment: ${deal.investorId.name} paid $${amount} for ${deal.entrepreneurId.startupName}. Review required.`,
            type: "payment_review", // New type
            link: `/admin/payments`
        }));
        
        if (adminNotifications.length > 0) {
            await Notification.insertMany(adminNotifications);
        }

        // 2. Email Notification (Using service)
        // We send to the configured ADMIN_EMAIL, but optionally could loop through all admins if they have emails.
        // The service uses process.env.ADMIN_EMAIL.
        await sendAdminPaymentNotification(deal, amount, deal.investorId.name, paymentIntentId);

        res.status(200).json({ message: "Payment confirmed", transaction });

    } catch (error) {
        console.error("Deal Confirm Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// Get all deal transactions (Admin)
paymentRouter.get("/admin/deal-transactions", async (req, res) => {
    try {
        await connectDB();
        const transactions = await DealTransaction.find({})
            .populate('dealId', 'investmentAmount equityOffered preMoneyValuation')
            .populate('investorId', 'name email')
            .populate('entrepreneurId', 'name email startupName')
            .sort({ createdAt: -1 });
        
        res.status(200).json(transactions);
    } catch (error) {
        console.error("Fetch Deal Tx Error:", error);
         res.status(500).json({ message: error.message });
    }
});

// Admin Release Funds
paymentRouter.post("/admin/release-funds", async (req, res) => {
    try {
        await connectDB();
        const { transactionId } = req.body;
        
        const transaction = await DealTransaction.findById(transactionId);
        if (!transaction) return res.status(404).json({ message: "Transaction not found" });

        if (transaction.status === 'released') {
             return res.status(400).json({ message: "Funds already released" });
        }

        const deal = await Deal.findById(transaction.dealId);
        if (!deal) return res.status(404).json({ message: "Deal not found" });

// Import Card at top (I will do this in next step or use multi-replace if I can reach top) - logic here first
        // Check for Entrepreneur's Default Card
        const defaultCard = await Card.findOne({ userId: deal.entrepreneurId, isDefault: true });
        
        if (!defaultCard) {
            // Notify Entrepreneur to add a card
            const notif = new Notification({
                recipient: deal.entrepreneurId,
                sender: deal.investorId, // or admin ID - using investor ID to keep it relevant to the deal context or could be system/admin
                message: `Action Required: Please add a default payment card to receive your investment funds of $${transaction.amount}.`,
                type: "action_required", // New type or existing
                link: `/settings` // Assuming this is where they manage cards
            });
            await notif.save();

            return res.status(400).json({ 
                message: "Entrepreneur has no default card. A notification has been sent to them to add one." 
            });
        }

        // Logic to transfer to defaultCard... (Simulated)
        // console.log(`Releasing to card ending in ${defaultCard.cardNumber.slice(-4)}`);

        transaction.status = 'released';
        transaction.adminActionDate = new Date();
        await transaction.save();

        // Update Deal
        deal.paymentStatus = 'funds_released';
        await deal.save();

        // Notify Entrepreneur
        const notif = new Notification({
            recipient: deal.entrepreneurId,
            sender: deal.investorId, // or admin ID
            message: `Funds of $${transaction.amount} have been released to your default card (ending ${defaultCard.cardNumber.slice(-4)})!`,
            type: "funds_released",
            link: `/dashboard/entrepreneur`
        });
        await notif.save();

        // --- UPDATE ENTREPRENEUR PROFILE ---
        try {
            console.log(`Attempting to update profile for entrepreneur: ${deal.entrepreneurId}`);
            const entrepreneurProfile = await Enterpreneur.findOne({ userId: deal.entrepreneurId });
            
            if (entrepreneurProfile) {
                console.log("Found entrepreneur profile. Updating history...");
                // 1. Add to Funding History
                entrepreneurProfile.fundingHistory.push({
                    amount: deal.investmentAmount,
                    stage: deal.stage || 'Seed', 
                    year: new Date().getFullYear(),
                    date: new Date()
                });

                // 2. Update Valuation
                if (deal.postMoneyValuation) {
                    entrepreneurProfile.valuation = deal.postMoneyValuation;
                }

                // 3. Update Status Flags
                const stage = deal.stage || 'Seed';
                if (stage === 'Pre-Seed') entrepreneurProfile.preSeedStatus = 'completed';
                if (stage === 'Seed') {
                    entrepreneurProfile.preSeedStatus = 'completed';
                    entrepreneurProfile.seedStatus = 'completed';
                }
                if (stage === 'Series A') {
                    entrepreneurProfile.preSeedStatus = 'completed';
                    entrepreneurProfile.seedStatus = 'completed';
                    entrepreneurProfile.seriesAStatus = 'completed';
                }

                await entrepreneurProfile.save();
                console.log("Entrepreneur profile updated successfully with new funding.");
            } else {
                console.error(`Entrepreneur profile not found for userId: ${deal.entrepreneurId}`);
            }
        } catch (updateError) {
            console.error("Error updating entrepreneur profile:", updateError);
        }

        res.status(200).json({ message: `Funds released successfully to card ending in ${defaultCard.cardNumber.slice(-4)}`, transaction });

    } catch (error) {
         console.error("Release Funds Error:", error);
         res.status(500).json({ message: `Server Error: ${error.message}` });
    }
});

export default paymentRouter;
