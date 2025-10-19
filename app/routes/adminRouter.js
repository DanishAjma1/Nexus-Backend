import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection.js";
import User from "../models/user.js";
import Enterpreneurs from "../models/enterpreneur.js";
import Campaign from "../models/campaign.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import Investor from "../models/investor.js";
const adminRouter = Router();

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}


const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

adminRouter.get("/dashboard", async (req, res) => {
  try {
    await connectDB();

    const totalStartups = await User.countDocuments({ role: "entrepreneur" });
    const totalInvestors = await User.countDocuments({ role: "investor" });
    const totalSupporters = await User.countDocuments({ role: "supporter" });
    const totalCampaigns = await Campaign.countDocuments();

    const flaggedUsers = await User.countDocuments({ isFlagged: true });
    const flaggedCampaigns = await Campaign.countDocuments({ isFlagged: true });
    const flaggedCount = flaggedUsers + flaggedCampaigns;

    res.status(200).json({
      startups: totalStartups,
      investors: totalInvestors,
      supporters: totalSupporters,
      campaigns: totalCampaigns,
      flagged: flaggedCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch dashboard data", error });
  }
});


adminRouter.get("/users", async (req, res) => {
  try {
    await connectDB();

    const users = await User.find({}, "-password").lean();
    const entrepreneurs = await Enterpreneurs.find().lean();
    const { default: Investor } = await import("../models/investor.js");
    const investors = await Investor.find().lean();

    console.log("Entrepreneurs found:", entrepreneurs.length);
    console.log("Investors found:", investors.length);

    const enrichedUsers = users.map((user) => {
      if (user.role === "entrepreneur") {
        const e = entrepreneurs.find((en) => en.userId?.toString() === user._id.toString());
        return {
          ...user,
          startupName: e?.startupName || "",
          industry: e?.industry || "",
          foundedYear: e?.foundedYear || "",
        };
      } else if (user.role === "investor") {
        const inv = investors.find((iv) => iv.userId?.toString() === user._id.toString());
        return {
          ...user,
          totalInvestments: inv?.totalInvestments || 0,
          investmentInterests: inv?.investmentInterests || [],
        };
      } else {
        return user;
      }
    });

    res.status(200).json(enrichedUsers);
  } catch (error) {
    console.error("❌ Failed to fetch users:", error);
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
});


import mongoose from "mongoose";

adminRouter.delete("/user/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;

    console.log("Deleting user:", id);

    
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      console.log("⚠️ User not found:", id);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("✅ Deleted from User collection");

   
    const eResult = await Enterpreneurs.deleteOne({
      userId: new mongoose.Types.ObjectId(id),
    });
    console.log("🧾 Entrepreneur delete result:", eResult);

    
    const { default: Investor } = await import("../models/investor.js");
    const iResult = await Investor.deleteOne({
      userId: new mongoose.Types.ObjectId(id),
    });
    console.log("💰 Investor delete result:", iResult);

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res
      .status(500)
      .json({ message: "Failed to delete user", error: error.message });
  }
});



adminRouter.post("/campaigns", upload.array("images", 5), async (req, res) => {
  try {
    await connectDB();
    console.log("📩 /admin/campaigns route hit!");

    const { title, description, goalAmount, startDate, endDate, category } = req.body;

    if (!title || !description || !goalAmount || !startDate || !endDate) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    const imagePaths = req.files?.map((file) => `/uploads/${file.filename}`) || [];

    const newCampaign = new Campaign({
      createdBy: null,
      title,
      description,
      goalAmount,
      startDate,
      endDate,
      category,
      images: imagePaths,
      status: "active",
    });

    await newCampaign.save();

    res.status(201).json({ message: "Campaign created successfully!", campaign: newCampaign });
  } catch (error) {
    console.error("CAMPAIGN CREATION ERROR:", error);
    res.status(500).json({ message: "Failed to create campaign", error: error.message });
  }
});

adminRouter.get("/campaigns", async (req, res) => {
  try {
    await connectDB();
    const campaigns = await Campaign.find().populate("createdBy", "name email");
    res.status(200).json(campaigns);
  } catch (error) {
    console.error("FAILED TO FETCH CAMPAIGNS:", error.message);
    res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/campaigns/:id/status", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { status } = req.body;

    const updated = await Campaign.findByIdAndUpdate(id, { status }, { new: true });
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update campaign status", error });
  }
});

export default adminRouter;
