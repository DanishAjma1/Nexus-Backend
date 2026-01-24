import express from "express";
import Stripe from "stripe";
import { connectDB } from "../config/mongoDBConnection.js";
import Transaction from "../models/transaction.js";
import Campaign from "../models/campaign.js";
import Supporter from "../models/supporter.js";
import User from "../models/user.js";

const router = express.Router();
const stripe = new Stripe(process.env.Stripe_Secret_key);

// Webhook handler
// uses express.raw() to access the raw body for signature verification
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook Signature Verification Failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    try {
        await handlePaymentSuccess(paymentIntent);
    } catch (error) {
        console.error("Error processing webhook payment success:", error);
        // Return 500 to retry webhook
        return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

/**
 * Handles payment_intent.succeeded event
 * Checks if transaction exists, if not, creates it and updates campaign.
 */
async function handlePaymentSuccess(paymentIntent) {
    await connectDB();
    const { metadata, amount, id: paymentIntentId } = paymentIntent;
    const { campaignId, userId, guestName, guestPhone, guestEmail, isGuest } = metadata;

    // 1. Check if transaction already exists (Idempotency)
    const existingTransaction = await Transaction.findOne({ paymentIntentId: paymentIntentId });
    if (existingTransaction) {
        console.log(`[Webhook] Transaction ${paymentIntentId} already processed.`);
        return;
    }

    console.log(`[Webhook] Processing new transaction ${paymentIntentId} for campaign ${campaignId}`);

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
        console.error(`[Webhook] Campaign ${campaignId} not found.`);
        return;
    }

    // 2. Prepare transaction data
    let transactionData = {
        campaignId: campaignId,
        amount: amount / 100, // Convert cents to dollars
        paymentIntentId: paymentIntentId,
        status: "succeeded",
    };

    let supporterId;

    if (userId) {
        transactionData.userId = userId;
        // Fetch user name for transaction record if possible, or just skip name
        const user = await User.findById(userId);
        if (user) transactionData.userName = user.name;
        supporterId = userId;
    } else {
        // Handle Guest
        let supporter = await Supporter.findOne({ 
            $or: [{ phoneNumber: guestPhone }, { email: guestEmail }] 
        });

        if (!supporter) {
            supporter = new Supporter({
                name: guestName || "Guest",
                phoneNumber: guestPhone,
                email: guestEmail
            });
            await supporter.save();
        }

        transactionData.supporterId = supporter._id;
        transactionData.userName = guestName;
        supporterId = supporter._id;
    }

    // 3. Save Transaction
    const transaction = new Transaction(transactionData);
    await transaction.save();

    // 4. Update Campaign
    campaign.raisedAmount += transactionData.amount;

    // Update supporters list
    const isGuestBool = !!(isGuest === "true" || !userId);
    let existingSupporterIndex = -1;

    if (isGuestBool) {
         existingSupporterIndex = campaign.supporters.findIndex(
            (s) => s.guestId && s.guestId.toString() === supporterId.toString()
        );
    } else {
         existingSupporterIndex = campaign.supporters.findIndex(
            (s) => s.supporterId && s.supporterId.toString() === supporterId.toString()
        );
    }

    if (existingSupporterIndex > -1) {
        campaign.supporters[existingSupporterIndex].amount += transactionData.amount;
        campaign.supporters[existingSupporterIndex].date = Date.now();
    } else {
        const newSupporter = {
            amount: transactionData.amount,
            date: Date.now(),
            isGuest: isGuestBool
        };
        
        if (isGuestBool) {
            newSupporter.guestId = supporterId;
        } else {
            newSupporter.supporterId = supporterId;
        }
        
        campaign.supporters.push(newSupporter);
    }

    await campaign.save();
    console.log(`[Webhook] Successfully recorded payment for campaign ${campaign.title}`);
}

export default router;
