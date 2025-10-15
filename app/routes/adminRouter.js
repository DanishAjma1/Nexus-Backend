import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection.js";
import User from "../models/user.js";
import Enterprenuer from "../models/enterpreneur.js";
import Campaign from "../models/campaign.js";
import multer from "multer";
import path from "path";
const adminRouter = Router();

import fs from "fs";
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
    const users = await User.find(
  {},
  "name email role lastLoginTime lastLogoutTime totalSessionDuration lastLogoutDuration"
);
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error });
  }
});


adminRouter.delete("/user/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    await Enterprenuer.deleteOne({ userId: id });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error });
  }
});

adminRouter.post("/campaigns", upload.array("images", 5), async (req, res) => {
  try {
    await connectDB();
console.log("📩 /admin/campaigns route hit!");
  res.status(200).send("Campaign route OK");
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
