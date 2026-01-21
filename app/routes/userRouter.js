import { Router } from "express";
import User from "../models/user.js";
import Card from "../models/card.js";
import Deal from "../models/deal.js";
import Campaign from "../models/campaign.js";
import Transaction from "../models/transaction.js";
import DealTransaction from "../models/dealTransaction.js";
import Enterpreneur from "../models/enterpreneur.js";
import multer from "multer";
import { connectDB } from "../config/mongoDBConnection.js";
import jwt from "jsonwebtoken";
import fs from "fs";

const userRouter = Router();

userRouter.get("/platform-stats", async (req, res) => {
  try {
    await connectDB();
    
    // Total Invested: Sum of investmentAmount from all released funds
    const totalInvestedResult = await Deal.aggregate([
      { $match: { paymentStatus: "funds_released" } },
      { $group: { _id: null, total: { $sum: "$investmentAmount" } } }
    ]);
    const totalInvested = totalInvestedResult[0]?.total || 0;

    // Total Investors: Count of approved investors
    const totalInvestors = await User.countDocuments({ 
      role: "investor", 
      approvalStatus: "approved" 
    });

    // Total Startups (Active Deals): Count of approved and non-suspended/non-blocked entrepreneurs
    const totalStartups = await User.countDocuments({
      role: "entrepreneur",
      approvalStatus: "approved",
      isBlocked: { $ne: true },
      isSuspended: { $ne: true }
    });

    // Total Funded (Campaigns): Sum of raisedAmount from approved/active/completed campaigns
    const totalFundedResult = await Campaign.aggregate([
      { $match: { status: { $in: ["approved", "active", "completed"] } } },
      { $group: { _id: null, total: { $sum: "$raisedAmount" } } }
    ]);
    const totalFunded = totalFundedResult[0]?.total || 0;

    // Success Rate (Campaigns): (Successful / Total) * 100
    const campaignsCount = await Campaign.countDocuments({ 
      status: { $in: ["approved", "active", "completed"] } 
    });
    const successfulCampaignsCount = await Campaign.countDocuments({
      status: { $in: ["approved", "active", "completed"] },
      $expr: { $gte: ["$raisedAmount", "$goalAmount"] }
    });
    const successRate = campaignsCount > 0 
      ? Math.round((successfulCampaignsCount / campaignsCount) * 100) 
      : 95; // Default/Fallback if no campaigns

    res.status(200).json({
      totalInvested,
      totalInvestors,
      totalStartups,
      totalFunded,
      successRate
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});
//create storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
//  Upload multer storage
const upload = multer({ storage });

//  Saving images
userRouter.post(
  "/update-profile/:id",
  upload.single("avatarUrl"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, bio, location } = req.body;

      await connectDB();
      let uri;
      if (req.file) {
        uri = `${req.protocol}://${req.get("host")}/${req.file.destination}${
          req.file.filename
        }`;
      }
      let user;
      if (uri === "") {
        user = await User.findByIdAndUpdate(
          id,
          { name, bio, location },
          { new: true }
        );
      } else {
        user = await User.findByIdAndUpdate(
          id,
          { name, bio, location, avatarUrl: uri },
          { new: true }
        ).lean();
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { _id, __v, ...rest } = user;

      res.status(200).json({
        message: "Data updated successfully..",
        user: {
          userId: _id,
          ...rest,
        },
      });
    } catch (err) {
      return res.status(500).json({ message: err });
    }
  }
);

userRouter.get("/get-user-by-id/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await connectDB();
    const filter = {
      _id: id,
    };
    const user = await User.findOne(filter).select("-password");
    res.status(200).json({ user });
  } catch (error) {
    console.log(error.message);
    res.status(400).json(error.message);
  }
});

export const setOnline = async (userId, status) => {
  try {
    await connectDB();
  const user = await User.findByIdAndUpdate(userId, { isOnline: status });
    if (user.isOnline) return true;
    else return false;
  } catch (err) {
    console.error(err);
  }
};

// Helper function to get user from token
const getUserFromToken = async (req) => {
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

// Add a new card
userRouter.post("/cards", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    const { cardNumber, cardholderName, cvv, expiryMonth, expiryYear, isDefault } = req.body;

    if (!cardNumber || !cardholderName || !cvv || !expiryMonth || !expiryYear) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // If this is set as default, unset all other default cards for this user
    if (isDefault) {
      await Card.updateMany(
        { userId: user._id },
        { isDefault: false }
      );
    }

    const card = new Card({
      userId: user._id,
      cardNumber,
      cardholderName,
      cvv,
      expiryMonth,
      expiryYear,
      isDefault: isDefault || false,
    });

    await card.save();

    res.status(201).json({
      message: "Card added successfully",
      card: {
        id: card._id,
        cardNumber: card.cardNumber,
        cardholderName: card.cardholderName,
        cvv: card.cvv,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        isDefault: card.isDefault,
      },
    });
  } catch (error) {
    console.error("Add card error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get all cards for the user
userRouter.get("/cards", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    const cards = await Card.find({ userId: user._id }).sort({ createdAt: -1 });

    const formattedCards = cards.map((card) => {
      // Mask card number, show only last 4 digits
      const last4 = card.cardNumber.slice(-4);
      const maskedNumber = "•••• " + last4;
      
      return {
        id: card._id,
        cardNumber: maskedNumber,
        last4: last4,
        cardholderName: card.cardholderName,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        isDefault: card.isDefault,
      };
    });

    res.status(200).json({ cards: formattedCards });
  } catch (error) {
    console.error("Get cards error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get a single card by ID (for editing)
userRouter.get("/cards/:cardId", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    const { cardId } = req.params;

    const card = await Card.findOne({ _id: cardId, userId: user._id });
    if (!card) {
      return res.status(404).json({ message: "Card not found" });
    }

    // Format card number with spaces for display
    const cardNumber = card.cardNumber.replace(/(.{4})/g, "$1 ").trim();

    res.status(200).json({
      card: {
        id: card._id,
        cardNumber: cardNumber,
        cardholderName: card.cardholderName,
        cvv: card.cvv,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        isDefault: card.isDefault,
      },
    });
  } catch (error) {
    console.error("Get card error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update a card
userRouter.put("/cards/:cardId", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    const { cardId } = req.params;
    const { cardNumber, cardholderName, cvv, expiryMonth, expiryYear, isDefault } = req.body;

    if (!cardNumber || !cardholderName || !cvv || !expiryMonth || !expiryYear) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const card = await Card.findOne({ _id: cardId, userId: user._id });
    if (!card) {
      return res.status(404).json({ message: "Card not found" });
    }

    // If this is set as default, unset all other default cards for this user
    if (isDefault) {
      await Card.updateMany(
        { userId: user._id, _id: { $ne: cardId } },
        { isDefault: false }
      );
    }

    // Update card fields
    card.cardNumber = cardNumber.replace(/\s/g, "");
    card.cardholderName = cardholderName;
    card.cvv = cvv;
    card.expiryMonth = expiryMonth;
    card.expiryYear = expiryYear;
    card.isDefault = isDefault || false;

    await card.save();

    res.status(200).json({
      message: "Card updated successfully",
      card: {
        id: card._id,
        cardNumber: card.cardNumber,
        cardholderName: card.cardholderName,
        cvv: card.cvv,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        isDefault: card.isDefault,
      },
    });
  } catch (error) {
    console.error("Update card error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Set a card as default
userRouter.patch("/cards/:cardId/set-default", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    const { cardId } = req.params;

    const card = await Card.findOne({ _id: cardId, userId: user._id });
    if (!card) {
      return res.status(404).json({ message: "Card not found" });
    }

    // Unset all other default cards for this user
    await Card.updateMany(
      { userId: user._id, _id: { $ne: cardId } },
      { isDefault: false }
    );

    // Set this card as default
    card.isDefault = true;
    await card.save();

    res.status(200).json({
      message: "Card set as default successfully",
      card: {
        id: card._id,
        isDefault: card.isDefault,
      },
    });
  } catch (error) {
    console.error("Set default card error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a card
userRouter.delete("/cards/:cardId", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    const { cardId } = req.params;

    const card = await Card.findOne({ _id: cardId, userId: user._id });
    if (!card) {
      return res.status(404).json({ message: "Card not found" });
    }

    await Card.findByIdAndDelete(cardId);

    res.status(200).json({ message: "Card deleted successfully" });
  } catch (error) {
    console.error("Delete card error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get billing history for the authenticated user (all campaign contributions)
userRouter.get("/billing-history", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    
    // Get all transactions where user contributed to campaigns
    const transactions = await Transaction.find({ 
      userId: user._id,
      status: "succeeded" 
    })
      .populate("campaignId", "title")
      .sort({ createdAt: -1 });

    const billingHistory = transactions.map((tx) => ({
      id: tx._id,
      campaignName: tx.campaignId ? tx.campaignId.title : tx.campaignTitle || "Deleted Campaign",
      contributedAmount: tx.amount,
      date: tx.createdAt,
      paymentIntentId: tx.paymentIntentId,
    }));

    res.status(200).json({ billingHistory });
  } catch (error) {
    console.error("Get billing history error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get investment history for investors (startup investments via deals)
userRouter.get("/investment-history", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await connectDB();
    
    // Only investors can access investment history
    if (user.role !== "investor") {
      return res.status(403).json({ message: "Only investors can access investment history" });
    }
    
    // Get all deal transactions where user is the investor
    const dealTransactions = await DealTransaction.find({ 
      investorId: user._id,
      status: { $in: ["succeeded", "released"] }
    })
      .populate({
        path: "dealId",
        select: "entrepreneurId investmentAmount equityOffered",
        populate: {
          path: "entrepreneurId",
          select: "name"
        }
      })
      .populate("entrepreneurId", "name")
      .sort({ createdAt: -1 });

    const investmentHistory = await Promise.all(
      dealTransactions.map(async (tx) => {
        let startupName = "Unknown Startup";
        
        // Try to get startup name from entrepreneur profile
        if (tx.entrepreneurId) {
          const entrepreneurProfile = await Enterpreneur.findOne({ userId: tx.entrepreneurId });
          if (entrepreneurProfile && entrepreneurProfile.startupName) {
            startupName = entrepreneurProfile.startupName;
          } else if (tx.entrepreneurId.name) {
            startupName = tx.entrepreneurId.name;
          }
        } else if (tx.dealId && tx.dealId.entrepreneurId) {
          const entrepreneurProfile = await Enterpreneur.findOne({ userId: tx.dealId.entrepreneurId._id });
          if (entrepreneurProfile && entrepreneurProfile.startupName) {
            startupName = entrepreneurProfile.startupName;
          } else if (tx.dealId.entrepreneurId.name) {
            startupName = tx.dealId.entrepreneurId.name;
          }
        }

        return {
          id: tx._id,
          startupName: startupName,
          investedAmount: tx.amount,
          date: tx.createdAt,
          status: tx.status,
          paymentIntentId: tx.paymentIntentId,
        };
      })
    );

    res.status(200).json({ investmentHistory });
  } catch (error) {
    console.error("Get investment history error:", error);
    res.status(500).json({ message: error.message });
  }
});

export default userRouter;
