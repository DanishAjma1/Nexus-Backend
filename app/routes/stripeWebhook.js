import express from "express";
import Stripe from "stripe";
import { connectDB } from "../config/mongoDBConnection.js";
import Transaction from "../models/transaction.js";
import Campaign from "../models/campaign.js";
import Supporter from "../models/supporter.js";
import User from "../models/user.js";
import Deal from "../models/deal.js";
import DealTransaction from "../models/dealTransaction.js";
import Notification from "../models/notification.js";
import Enterpreneur from "../models/enterpreneur.js";
import { sendAdminPaymentNotification } from "../utils/paymentMailService.js";
import { emitNotification, emitNotifications } from "../utils/notificationEmitter.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Webhook handler
// uses express.raw() to access the raw body for signature verification
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify signature
    console.log("--- Webhook Debug ---");
    console.log("Secret Length:", endpointSecret?.length);
    console.log("Signature present:", !!sig);
    console.log("Body Type:", typeof req.body);
    console.log("Is Buffer:", Buffer.isBuffer(req.body));
    
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook Signature Verification Failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    try {
        const { metadata } = paymentIntent;
        const type = metadata.type;

        if (type === 'deal_payment') {
            await handleDealPayment(paymentIntent);
        } else if (type === 'additional_investment') {
            await handleAdditionalInvestment(paymentIntent);
        } else {
            // Default to campaign donation (backwards compatibility)
            await handleCampaignDonation(paymentIntent);
        }
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
 * Handles campaign donation payment success
 */
async function handleCampaignDonation(paymentIntent) {
    await connectDB();
    const { metadata, amount, id: paymentIntentId } = paymentIntent;
    const { campaignId, userId, guestName, guestPhone, guestEmail, isGuest } = metadata;

    if (!campaignId) {
        console.log("[Webhook] Missing campaignId in metadata. Skipping.");
        return;
    }

    // 1. Check if transaction already exists (Idempotency)
    const existingTransaction = await Transaction.findOne({ paymentIntentId: paymentIntentId });
    if (existingTransaction) {
        console.log(`[Webhook] Campaign Transaction ${paymentIntentId} already processed.`);
        return;
    }

    console.log(`[Webhook] Processing campaign donation ${paymentIntentId} for campaign ${campaignId}`);

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
        console.error(`[Webhook] Campaign ${campaignId} not found.`);
        return;
    }

    // 2. Prepare transaction data
    let transactionData = {
        campaignId: campaignId,
        campaignTitle: campaign.title,
        amount: amount / 100, // Convert cents to dollars
        paymentIntentId: paymentIntentId,
        status: "succeeded",
    };

    let supporterId;
    let isGuestBool = !!(isGuest === "true" || !userId);

    if (userId) {
        transactionData.userId = userId;
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
    console.log(`[Webhook] Successfully recorded campaign donation for ${campaign.title}`);
}

/**
 * Handles deal payment success
 */
async function handleDealPayment(paymentIntent) {
    await connectDB();
    const { metadata, id: paymentIntentId, amount_received } = paymentIntent;
    const { dealId } = metadata;

    if (!dealId) {
        console.error("[Webhook] dealId missing in metadata for deal_payment");
        return;
    }

    const existingTransaction = await DealTransaction.findOne({ paymentIntentId });
    if (existingTransaction) {
        console.log(`[Webhook] Deal transaction ${paymentIntentId} already processed.`);
        return;
    }

    const deal = await Deal.findById(dealId).populate('investorId').populate('entrepreneurId');
    if (!deal) {
        console.error(`[Webhook] Deal ${dealId} not found.`);
        return;
    }

    const entrepreneurProfile = await Enterpreneur.findOne({ userId: deal.entrepreneurId._id });
    const startupName = entrepreneurProfile?.startupName || deal.entrepreneurId.name;
    const amount = amount_received / 100;
    
    // Calculate 2% commission
    const commissionPercentage = 0.02;
    const platformCommission = amount * commissionPercentage;
    const netAmount = amount - platformCommission;
    
    // Create Transaction Record
    const transaction = new DealTransaction({
        dealId: dealId,
        investorId: deal.investorId._id,
        entrepreneurId: deal.entrepreneurId._id,
        amount: amount,
        platformCommission: platformCommission,
        netAmount: netAmount,
        investorName: deal.investorId.name,
        entrepreneurName: deal.entrepreneurId.name,
        paymentIntentId: paymentIntentId,
        status: "succeeded",
        stripeFee: 0 
    });
    await transaction.save();

    // Update Deal
    deal.paymentStatus = 'paid';
    deal.transactionId = transaction._id;
    await deal.save();

    // Notifications
    const notifications = [];

    // Notify Entrepreneur
    notifications.push(new Notification({
        recipient: deal.entrepreneurId._id,
        sender: deal.investorId._id,
        message: `Investment payment of $${amount} received! After 2% platform commission ($${platformCommission.toFixed(2)}), you will receive $${netAmount.toFixed(2)}. Funds are subject to admin approval before release.`,
        type: "deal_accepted",
        link: `/dashboard/entrepreneur` 
    }));

    // Notify Investor
    notifications.push(new Notification({
        recipient: deal.investorId._id,
        sender: deal.investorId._id,
        message: `Payment of $${amount} for ${startupName} successful. Entrepreneur will receive $${netAmount.toFixed(2)} after 2% commission. Waiting for admin processing.`,
        type: "deal_accepted",
        link: `/deals/sent-deals`
    }));

    // Notify Admins
    const admins = await User.find({ role: 'admin' });
    admins.forEach(admin => {
        notifications.push(new Notification({
            recipient: admin._id,
            sender: deal.investorId._id,
            message: `New Payment: ${deal.investorId.name} paid $${amount} for ${startupName}. Commission: $${platformCommission.toFixed(2)}. Entrepreneur to receive: $${netAmount.toFixed(2)}. Review required.`,
            type: "payment_review",
            link: `/admin/payments`
        }));
    });

    const savedNotifications = await Notification.insertMany(notifications);
    await emitNotifications(savedNotifications);

    // Email Notification
    await sendAdminPaymentNotification(deal, amount, deal.investorId.name, paymentIntentId, netAmount);

    console.log(`[Webhook] Successfully processed deal payment for deal ${dealId}`);
}

/**
 * Handles additional investment success
 */
async function handleAdditionalInvestment(paymentIntent) {
    await connectDB();
    const { metadata, id: paymentIntentId, amount_received } = paymentIntent;
    const { dealId } = metadata;

    if (!dealId) {
        console.error("[Webhook] dealId missing in metadata for additional_investment");
        return;
    }

    const existingTransaction = await DealTransaction.findOne({ paymentIntentId });
    if (existingTransaction) {
        console.log(`[Webhook] Additional investment transaction ${paymentIntentId} already processed.`);
        return;
    }

    const deal = await Deal.findById(dealId).populate('investorId').populate('entrepreneurId');
    if (!deal) {
        console.error(`[Webhook] Deal ${dealId} not found for additional investment.`);
        return;
    }

    const entrepreneurProfile = await Enterpreneur.findOne({ userId: deal.entrepreneurId._id });
    const startupName = entrepreneurProfile?.startupName || deal.entrepreneurId.name;
    const amount = amount_received / 100;
    
    // Calculate 2% commission
    const commissionPercentage = 0.02;
    const platformCommission = amount * commissionPercentage;
    const netAmount = amount - platformCommission;
    
    // Create Transaction Record
    const transaction = new DealTransaction({
        dealId: dealId,
        investorId: deal.investorId._id,
        entrepreneurId: deal.entrepreneurId._id,
        amount: amount,
        platformCommission: platformCommission,
        netAmount: netAmount,
        investorName: deal.investorId.name,
        entrepreneurName: deal.entrepreneurId.name,
        paymentIntentId: paymentIntentId,
        status: "succeeded",
        isAdditionalInvestment: true,
        stripeFee: 0
    });
    await transaction.save();

    // Notifications
    const notifications = [];

    // Notify Entrepreneur
    notifications.push(new Notification({
        recipient: deal.entrepreneurId._id,
        sender: deal.investorId._id,
        message: `Additional investment of $${amount} received from ${deal.investorId.name}! After 2% commission ($${platformCommission.toFixed(2)}), you will receive $${netAmount.toFixed(2)}. Pending admin approval.`,
        type: "deal_accepted",
        link: `/dashboard/entrepreneur` 
    }));

    // Notify Investor
    notifications.push(new Notification({
        recipient: deal.investorId._id,
        sender: deal.investorId._id,
        message: `Additional investment of $${amount} for ${startupName} successful. Entrepreneur will receive $${netAmount.toFixed(2)} after 2% commission. Waiting for admin processing.`,
        type: "deal_accepted",
        link: `/deals/sent-deals`
    }));

    // Notify Admins
    const admins = await User.find({ role: 'admin' });
    admins.forEach(admin => {
        notifications.push(new Notification({
            recipient: admin._id,
            sender: deal.investorId._id,
            message: `Additional Investment: ${deal.investorId.name} invested $${amount} more in ${startupName}. Commission: $${platformCommission.toFixed(2)}. Net: $${netAmount.toFixed(2)}. Review required.`,
            type: "payment_review",
            link: `/admin/payments`
        }));
    });

    const savedNotifications = await Notification.insertMany(notifications);
    await emitNotifications(savedNotifications);

    // Email Notification
    await sendAdminPaymentNotification(deal, amount, deal.investorId.name, paymentIntentId, netAmount);

    console.log(`[Webhook] Successfully processed additional investment for deal ${dealId}`);
}

export default router;
