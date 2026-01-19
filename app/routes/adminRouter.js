import { Router } from "express";
import { connectDB } from "../config/mongoDBConnection.js";
import Enterprenuer from "../models/enterpreneur.js";
import Investor from "../models/investor.js";
import Campaign from "../models/campaign.js";
import Supporter from "../models/supporter.js";
import multer from "multer";
import moment from "moment";
const adminRouter = Router();
import fs from "fs";
import User from "../models/user.js";
import RejectionHistory from "../models/rejectionHistory.js";
import RiskEvent from "../models/riskEvent.js";
import Notification from "../models/notification.js";
import {
  sendApprovalMail,
  sendRejectionMail,
} from "../utils/approvalMailService.js";
import {
  sendSuspensionMail,
  sendBlockMail,
  sendUnblockMail,
  sendUnsuspendMail,
} from "../utils/suspensionBlockMailService.js";
import { checkApprovalStatus, adminOnly } from "../middleware/approvalMiddleware.js";
import jwt from "jsonwebtoken";
import dns from "dns";
import { promisify } from "util";
const resolveMx = promisify(dns.resolveMx);
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

const getAdminInfo = (req) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return { name: "zain", email: "admin@trustbridge.ai" };

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return {
      name: decoded.name || "Admin Team",
      email: decoded.email || "admin@trustbridge.ai",
    };
  } catch (error) {
    return { name: "Admin Team", email: "admin@trustbridge.ai" };
  }
};

adminRouter.get("/dashboard", async (req, res) => {
  try {
    await connectDB();

    const totalStartups = await User.countDocuments({ role: "entrepreneur" });
    const totalInvestors = await User.countDocuments({ role: "investor" });
    const totalSupporters = await Supporter.countDocuments();
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

adminRouter.get("/get-users", async (req, res) => {
  try {
    await connectDB();
    const users = await User.find({
      $or: [{ role: "entrepreneur" }, { role: "investor" }],
    });
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

adminRouter.post("/campaigns", upload.fields([{ name: "images", maxCount: 3 }, { name: "video", maxCount: 1 }]), async (req, res) => {
  try {
    await connectDB();
    const { title, description, goalAmount, startDate, endDate, category, organizer, isLifetime } =
      req.body;

    if (!title || !description || !goalAmount || !startDate || (!isLifetime && !endDate)) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided." });
    }

    const imagePaths =
      req.files["images"]?.map((file) => `/uploads/${file.filename}`) || [];
    
    const videoPath = req.files["video"]?.[0]
      ? `/uploads/${req.files["video"][0].filename}`
      : null;

    if (imagePaths.length === 0) {
      return res.status(400).json({ message: "At least one image is required." });
    }

    const newCampaign = new Campaign({
      createdBy: null,
      title,
      description,
      goalAmount,
      startDate,
      endDate: isLifetime ? null : endDate,
      isLifetime: isLifetime || false,
      category,
      organizer,
      images: imagePaths,
      video: videoPath,
      status: "active",
    });

    await newCampaign.save();

    // Send notifications to all approved users
    try {
      const users = await User.find({
        approvalStatus: "approved",
        isBlocked: false,
        $or: [{ role: "entrepreneur" }, { role: "investor" }]
      });

      if (users.length > 0) {
        // Find admin user ID to use as sender (or just get from token if available)
        const adminInfo = getAdminInfo(req);
        const adminUser = await User.findOne({ role: "admin" });
        const senderId = adminUser?._id;

        const notifications = users.map(u => ({
          recipient: u._id,
          sender: senderId,
          message: `New Campaign: ${title}. ${description.substring(0, 100)}${description.length > 100 ? "..." : ""}`,
          type: "general",
          link: `/dashboard/campaigns/${newCampaign._id}`
        }));

        await Notification.insertMany(notifications);
      }
    } catch (notifError) {
      console.error("NOTIFICATION ERROR FOR NEW CAMPAIGN:", notifError);
    }

    res.status(201).json({
      message: "Campaign created successfully!",
      campaign: newCampaign,
    });
  } catch (error) {
    console.error("CAMPAIGN CREATION ERROR:", error);
    res
      .status(500)
      .json({ message: "Failed to create campaign", error: error.message });
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

adminRouter.delete("/campaigns/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    await Campaign.findByIdAndDelete(id);
    res.status(200).json({ message: "Campaign deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete campaign", error });
  }
});

adminRouter.put("/campaigns/:id", upload.fields([{ name: "images", maxCount: 3 }, { name: "video", maxCount: 1 }]), async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { title, description, goalAmount, startDate, endDate, category, organizer, existingImages, removeVideo } = req.body;

    const currentCampaign = await Campaign.findById(id);
    if (!currentCampaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Handle Images
    // existingImages might be a single string or array, or undefined
    let keptImages = [];
    if (existingImages) {
      keptImages = Array.isArray(existingImages) ? existingImages : [existingImages];
    }
    
    // Parse keptImages to ensure they are relative paths if needed, 
    // but usually they come back as full URLs from frontend if we aren't careful.
    // Assuming frontend sends the path stored in DB (e.g. "/uploads/file.png"). 
    // If frontend sends full URL, we might need to strip domain? 
    // Let's rely on frontend sending back what it received or handling it there. 
    // Actually, the DB stores `/uploads/filename`. If frontend sends that back, we are good.

    const newImagePaths = req.files["images"]?.map((file) => `/uploads/${file.filename}`) || [];
    const finalImages = [...keptImages, ...newImagePaths];

    if (finalImages.length === 0) {
      return res.status(400).json({ message: "At least one image is required." });
    }

    // Handle Video
    let videoPath = currentCampaign.video;
    if (req.files["video"]?.[0]) {
      videoPath = `/uploads/${req.files["video"][0].filename}`;
    } else if (removeVideo === "true") {
      videoPath = null;
    }

    const updatedCampaign = await Campaign.findByIdAndUpdate(
      id,
      {
        title,
        description,
        organizer,
        goalAmount,
        startDate,
        endDate,
        category,
        images: finalImages,
        video: videoPath,
      },
      { new: true }
    );

    res.status(200).json({ message: "Campaign updated successfully", campaign: updatedCampaign });
  } catch (error) {
    console.error("UPDATE CAMPAIGN ERROR:", error);
    res.status(500).json({ message: "Failed to update campaign", error: error.message });
  }
});

adminRouter.put("/campaigns/:id/status", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { status } = req.body;

    const updated = await Campaign.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    res.status(200).json(updated);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update campaign status", error });
  }
});

adminRouter.get("/users/entrepreneurs", async (req, res) => {
  try {
    await connectDB();
    const entrepreneurs = await User.find(
      { role: "entrepreneur" },
      "-password"
    );
    res.status(200).json(entrepreneurs);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch entrepreneurs", error });
  }
});
adminRouter.get("/users/investors", async (req, res) => {
  try {
    await connectDB();
    const investors = await User.find({ role: "investor" }, "-password");
    res.status(200).json(investors);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch investors", error });
  }
});

adminRouter.get("/users/users-last-year", async (req, res) => {
  try {
    await connectDB();
    const last12Months = [...Array(12)]
      .map((_, i) => moment().subtract(i, "months").format("MMM"))
      .reverse();

    const users = await User.aggregate([
      {
        $match: {
          approvalStatus: "approved",
          createdAt: {
            $gte: moment().subtract(12, "months").toDate(),
          },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            role: "$role",
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          role: "$_id.role",
          count: 1,
        },
      },
      { $sort: { month: 1 } },
    ]);

    const finalData = last12Months.map((monthName, index) => {
      const monthNumber = index + 1;

      const investorData = users.find(
        (d) => d.month === monthNumber && d.role === "investor"
      );
      const entrepreneurData = users.find(
        (d) => d.month === monthNumber && d.role === "entrepreneur"
      );

      return {
        month: monthName,
        investor: investorData ? investorData.count : 0,
        entrepreneur: entrepreneurData ? entrepreneurData.count : 0,
      };
    });

    res.json(finalData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/users/startup-by-industry", async (req, res) => {
  try {
    await connectDB();
    const users = await Enterprenuer.aggregate([
      {
        $match: {
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: "$industry",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          industry: "$_id",
          count: 1,
        },
      },
    ]);

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/get-investor-stages", async (req, res) => {
  await connectDB();
  const investors = await Investor.aggregate({});
});

// =====================
//  GET FLAGS SUMMARY
// =====================
adminRouter.get("/risk-detection-flags", async (req, res) => {
  try {
    await connectDB();
    const summary = await RiskEvent.aggregate([
      {
        $group: {
          _id: "$eventType",
          email: { $first: "$email" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          eventType: "$_id",
          count: 1,
          email: 1,
        },
      },
    ]);

    // monthly count for chart
    const last12Months = [...Array(12)]
      .map((_, i) => moment().subtract(i, "months").format("MMM"))
      .reverse();

    const finalData = await RiskEvent.aggregate([
      {
        $match: {
          createdAt: {
            $gte: moment().subtract(12, "months").toDate(),
          },
        },
      },
      {
        $group: {
          _id: "$eventType",
          riskScore: { $first: "$riskScore" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          eventType: "$_id",
          count: 1,
          riskScore: 1,
        },
      },
    ]);

    res.json({ summary, finalData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching risk flags" });
  }
});

export const logRiskEvent = async ({
  email,
  eventType,
  riskScore,
  isFraud = false,
}) => {
  try {
    await RiskEvent.create({
      email,
      eventType,
      riskScore,
      isFraud,
    });
    console.log("risk detected");
  } catch (err) {
    console.error("Risk Event Log Error:", err);
  }
};

const DISPOSABLE_DOMAINS = [
  "mailinator.com", "yopmail.com", "10minutemail.com", "temp-mail.org",
  "guerrillamail.com", "sharklasers.com", "dispostable.com", "getairmail.com",
  "maildrop.cc", "mintemail.com", "teleworm.us", "dayrep.com", "armyspy.com",
  "disposable.com", "emailfake.com", "fakeinbox.com", "mailnesia.com",
  "mailnull.com", "moakt.com", "mytrashmail.com", "pichumail.com",
  "temp-mail.io", "tempmail.net", "tempmail.com", "trbvm.com"
];

adminRouter.get("/verify-email/:email", async (req, res) => {
  const { email } = req.params;
  try {
    // 1. Syntax check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({ exists: false, reason: "Invalid format" });
    }

    const domain = email.split("@")[1].toLowerCase();

    // 2. Disposable check
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      return res.json({ exists: false, reason: "Disposable email" });
    }

    // 3. MX Record check
    const mxRecords = await resolveMx(domain).catch(() => []);
    if (!mxRecords || mxRecords.length === 0) {
      return res.json({ exists: false, reason: "No mail server" });
    }

    // If we reach here, it's a valid format, not disposable, and has MX records.
    return res.json({ exists: true });
  } catch (error) {
    return res.json({ exists: false, reason: "Verification error" });
  }
});

adminRouter.get("/pending-approvals", async (req, res) => {
  try {
    await connectDB();

    // Get pending entrepreneurs
    const pendingEntrepreneurs = await User.find(
      {
        role: "entrepreneur",
        approvalStatus: "pending",
      },
      "-password -twoFactorSecret -backupCodes"
    ).lean();

    // Get pending investors
    const pendingInvestors = await User.find(
      {
        role: "investor",
        approvalStatus: "pending",
      },
      "-password -twoFactorSecret -backupCodes"
    ).lean();

    // Get entrepreneur details for pending users
    const entrepreneurDetails = await Promise.all(
      pendingEntrepreneurs.map(async (user) => {
        const entrepreneur = await Enterprenuer.findOne({
          userId: user._id,
        }).lean();
        // Check if this email was previously rejected
        const prev = await RejectionHistory.findOne({ email: user.email })
          .sort({ rejectedAt: -1 })
          .lean();
        return {
          ...user,
          details: entrepreneur,
          previouslyRejected: !!prev,
          previousRejectionReason: prev?.reason || null,
          previousRejectionDate: prev?.rejectedAt || null,
        };
      })
    );

    // Get investor details for pending users
    const investorDetails = await Promise.all(
      pendingInvestors.map(async (user) => {
        const investor = await Investor.findOne({ userId: user._id }).lean();
        const prev = await RejectionHistory.findOne({ email: user.email })
          .sort({ rejectedAt: -1 })
          .lean();
        return {
          ...user,
          details: investor,
          previouslyRejected: !!prev,
          previousRejectionReason: prev?.reason || null,
          previousRejectionDate: prev?.rejectedAt || null,
        };
      })
    );

    res.status(200).json({
      entrepreneurs: entrepreneurDetails,
      investors: investorDetails,
      totalPending: pendingEntrepreneurs.length + pendingInvestors.length,
    });
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    res.status(500).json({
      message: "Failed to fetch pending approvals",
      error: error.message,
    });
  }
});

adminRouter.get("/approved-users", async (req, res) => {
  try {
    await connectDB();

    const approvedUsers = await User.find(
      {
        $or: [{ role: "entrepreneur" }, { role: "investor" }],
        approvalStatus: "approved",
      },
      "-password -twoFactorSecret -backupCodes"
    ).lean();

    res.status(200).json({
      users: approvedUsers,
      total: approvedUsers.length,
    });
  } catch (error) {
    console.error("Error fetching approved users:", error);
    res.status(500).json({
      message: "Failed to fetch approved users",
      error: error.message,
    });
  }
});

adminRouter.get("/rejected-users", async (req, res) => {
  try {
    await connectDB();

    const rejectedUsers = await User.find(
      {
        $or: [{ role: "entrepreneur" }, { role: "investor" }],
        approvalStatus: "rejected",
      },
      "-password -twoFactorSecret -backupCodes"
    )
      .select(
        "_id name email role approvalStatus rejectionReason approvalDate createdAt"
      ) // Explicitly select fields
      .lean();

    // For each rejected user, get their detailed profile (entrepreneur/investor)
    const usersWithDetails = await Promise.all(
      rejectedUsers.map(async (user) => {
        let details = null;

        if (user.role === "entrepreneur") {
          details = await Enterprenuer.findOne({ userId: user._id }).lean();
        } else if (user.role === "investor") {
          details = await Investor.findOne({ userId: user._id }).lean();
        }

        return {
          ...user,
          details: {
            ...details,
            rejectionReason: user.rejectionReason, // Add rejectionReason to details
            rejectedAt: user.approvalDate, // Add rejection date as rejectedAt
          },
          // Also keep at root level for backward compatibility
          rejectionReason: user.rejectionReason,
        };
      })
    );

    res.status(200).json({
      users: usersWithDetails,
      total: usersWithDetails.length,
    });
  } catch (error) {
    console.error("Error fetching rejected users:", error);
    res.status(500).json({
      message: "Failed to fetch rejected users",
      error: error.message,
    });
  }
});

adminRouter.post("/approve-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    await connectDB();

    // Verify the user exists and is pending
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.approvalStatus !== "pending") {
      return res.status(400).json({
        message: `User account is already ${user.approvalStatus}`,
      });
    }

    // Get admin info if token provided
    let adminId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        adminId = decoded.userId || decoded._id;
      } catch (err) {
        console.log("Could not decode admin token");
      }
    }

    // Update user approval status
    const approvalToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        approvalStatus: "approved",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    user.approvalStatus = "approved";
    user.approvedBy = adminId;
    user.approvalDate = new Date();
    await user.save();

    // Update corresponding model approval status
    if (user.role === "entrepreneur") {
      await Enterprenuer.updateOne(
        { userId: user._id },
        { approvalStatus: "approved" }
      );
    } else if (user.role === "investor") {
      await Investor.updateOne(
        { userId: user._id },
        { approvalStatus: "approved" }
      );
    }

    // Send approval email
    try {
      await sendApprovalMail(user.email, user.name, user.role, approvalToken);
    } catch (mailError) {
      console.error("Mail sending error:", mailError);
      // Don't fail the approval if email fails, just log it
    }

    // Create welcome notification for the newly approved user
    try {
      const welcomeMessage = `Welcome to TrustBridge AI! 🎉 Your ${user.role} account has been approved. You can now access all platform features and start connecting with ${user.role === 'entrepreneur' ? 'investors' : 'startups'}. We're excited to have you on board!`;
      
      await Notification.create({
        recipient: user._id,
        sender: adminId, // Admin who approved the user
        message: welcomeMessage,
        type: "approval",
        isRead: false,
      });
    } catch (notificationError) {
      console.error("Welcome notification creation error:", notificationError);
      // Don't fail the approval if notification creation fails
    }

    res.status(200).json({
      message: `${user.role} account approved successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        approvalDate: user.approvalDate,
      },
    });
  } catch (error) {
    console.error("Error approving user:", error);
    res
      .status(500)
      .json({ message: "Failed to approve user", error: error.message });
  }
});

adminRouter.post("/reject-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim() === "") {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    await connectDB();

    // Verify the user exists and is pending
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.approvalStatus !== "pending") {
      return res.status(400).json({
        message: `User account is already ${user.approvalStatus}`,
      });
    }

    // Update user approval status
    user.approvalStatus = "rejected";
    user.rejectionReason = rejectionReason;
    user.approvalDate = new Date();
    await user.save();

    // Save rejection history for auditing (so re-registrations can be recognized)
    try {
      await RejectionHistory.create({
        email: user.email,
        userId: user._id,
        reason: rejectionReason,
        rejectedAt: new Date(),
      });
    } catch (histErr) {
      console.error("Failed to save rejection history:", histErr);
    }

    // Update corresponding model approval status
    if (user.role === "entrepreneur") {
      await Enterprenuer.updateOne(
        { userId: user._id },
        { approvalStatus: "rejected" }
      );
    } else if (user.role === "investor") {
      await Investor.updateOne(
        { userId: user._id },
        { approvalStatus: "rejected" }
      );
    }

    // Send rejection email
    try {
      await sendRejectionMail(
        user.email,
        user.name,
        user.role,
        rejectionReason
      );
    } catch (mailError) {
      console.error("Mail sending error:", mailError);
      // Don't fail the rejection if email fails, just log it
    }

    res.status(200).json({
      message: `${user.role} account rejected successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        rejectionReason: user.rejectionReason,
        approvalDate: user.approvalDate,
      },
    });
  } catch (error) {
    console.error("Error rejecting user:", error);
    res
      .status(500)
      .json({ message: "Failed to reject user", error: error.message });
  }
});

adminRouter.delete("/delete-rejected-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    await connectDB();

    // Verify the user exists and is rejected
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.approvalStatus !== "rejected") {
      return res.status(400).json({
        message: "Only rejected users can be deleted",
      });
    }

    // Delete user
    await User.findByIdAndDelete(userId);

    // Delete associated entrepreneur or investor record
    if (user.role === "entrepreneur") {
      await Enterprenuer.deleteOne({ userId: userId });
    } else if (user.role === "investor") {
      await Investor.deleteOne({ userId: userId });
    }

    res.status(200).json({
      message: `${user.role} account deleted successfully`,
      deletedUser: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error deleting rejected user:", error);
    res
      .status(500)
      .json({ message: "Failed to delete user", error: error.message });
  }
});

adminRouter.get("/user-approval-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    await connectDB();

    const user = await User.findById(
      userId,
      "-password -twoFactorSecret -backupCodes"
    ).lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
      rejectionReason: user.rejectionReason,
      approvalDate: user.approvalDate,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Error fetching user approval status:", error);
    res.status(500).json({
      message: "Failed to fetch user approval status",
      error: error.message,
    });
  }
});

adminRouter.get("/approval-stats", async (req, res) => {
  try {
    await connectDB();

    const pendingCount = await User.countDocuments({
      $or: [{ role: "entrepreneur" }, { role: "investor" }],
      approvalStatus: "pending",
    });

    const approvedCount = await User.countDocuments({
      $or: [{ role: "entrepreneur" }, { role: "investor" }],
      approvalStatus: "approved",
    });

    const rejectedCount = await User.countDocuments({
      $or: [{ role: "entrepreneur" }, { role: "investor" }],
      approvalStatus: "rejected",
    });

    res.status(200).json({
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      total: pendingCount + approvedCount + rejectedCount,
    });
  } catch (error) {
    console.error("Error fetching approval stats:", error);
    res.status(500).json({
      message: "Failed to fetch approval statistics",
      error: error.message,
    });
  }
});

// =====================
//  SUSPEND/BLOCK USER ROUTES
// =====================

// Suspend user
adminRouter.post("/suspend-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, suspensionDays } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!reason || !suspensionDays) {
      return res
        .status(400)
        .json({ message: "Suspension reason and days are required" });
    }

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot suspend admin user" });
    }

    // Get admin info if token provided
    let adminId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        adminId = decoded.userId || decoded._id;
      } catch (err) {
        console.log("Could not decode admin token");
      }
    }

    const suspensionEndDate = new Date();
    suspensionEndDate.setDate(
      suspensionEndDate.getDate() + parseInt(suspensionDays)
    );

    // Increment suspension count
    const currentCount = (user.suspensionCount || 0) + 1;
    
    if (currentCount >= 4) {
      // 4th time: Permanent Block
      user.isBlocked = true;
      user.blockReason = `Permanent block due to exceeding maximum suspension limit (4th violation). Original reason: ${reason}`;
      user.blockedAt = new Date();
      user.blockedBy = adminId;
      user.isSuspended = false; // It's a block now
      user.suspensionCount = currentCount;
      await user.save();
      await sendBlockMail(user.email, user.name, user.blockReason);
      
      return res.status(200).json({
        message: "User permanently blocked due to multiple violations (4th strike)",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          isBlocked: true,
          blockReason: user.blockReason,
        },
      });
    }

    user.isSuspended = true;
    user.suspensionReason = reason;
    user.suspensionStartDate = new Date();
    user.suspensionEndDate = suspensionEndDate;
    user.suspendedBy = adminId;
    user.suspensionCount = currentCount;
    await user.save();
    
    await sendSuspensionMail(user.email, user.name, reason, suspensionDays);
    res.status(200).json({
      message: "User suspended successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isSuspended: user.isSuspended,
        suspensionReason: user.suspensionReason,
        suspensionEndDate: user.suspensionEndDate,
      },
    });
  } catch (error) {
    console.error("Error suspending user:", error);
    res
      .status(500)
      .json({ message: "Failed to suspend user", error: error.message });
  }
});

// Block user
adminRouter.post("/block-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!reason || reason.trim() === "") {
      return res.status(400).json({ message: "Block reason is required" });
    }

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot block admin user" });
    }

    // Get admin info if token provided
    let adminId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        adminId = decoded.userId || decoded._id;
      } catch (err) {
        console.log("Could not decode admin token");
      }
    }

    user.isBlocked = true;
    user.blockReason = reason;
    user.blockedAt = new Date();
    user.blockedBy = adminId;
    // Also remove suspension if blocked
    user.isSuspended = false;
    await user.save();
    await sendBlockMail(user.email, user.name, reason);
    res.status(200).json({
      message: "User blocked successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked,
        blockReason: user.blockReason,
      },
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    res
      .status(500)
      .json({ message: "Failed to block user", error: error.message });
  }
});

// Unsuspend user
adminRouter.post("/unsuspend-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const adminInfo = getAdminInfo(req);
    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isSuspended = false;
    user.suspensionReason = undefined;
    user.suspensionStartDate = undefined;
    user.suspensionEndDate = undefined;
    user.suspendedBy = undefined;
    await user.save();

   
    await sendUnsuspendMail(user.email, user.name, adminInfo.name);
    res.status(200).json({
      message: "User unsuspended successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isSuspended: user.isSuspended,
      },
    });
  } catch (error) {
    console.error("Error unsuspending user:", error);
    res
      .status(500)
      .json({ message: "Failed to unsuspend user", error: error.message });
  }
});

// Unblock user
adminRouter.post("/unblock-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const adminInfo = getAdminInfo(req);
    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = false;
    user.blockReason = undefined;
    user.blockedAt = undefined;
    user.blockedBy = undefined;
    await user.save();
   
     await sendUnblockMail(user.email, user.name, adminInfo.name);
    res.status(200).json({
      message: "User unblocked successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked,
      },
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res
      .status(500)
      .json({ message: "Failed to unblock user", error: error.message });
  }
});

// Get suspended and blocked users
adminRouter.get("/suspended-blocked-users", async (req, res) => {
  try {
    await connectDB();

    const suspendedUsers = await User.find(
      {
        isSuspended: true,
      },
      "-password -twoFactorSecret -backupCodes"
    )
      .populate("suspendedBy", "name email")
      .lean();

    const blockedUsers = await User.find(
      {
        isBlocked: true,
      },
      "-password -twoFactorSecret -backupCodes"
    )
      .populate("blockedBy", "name email")
      .lean();

    res.status(200).json({
      suspended: suspendedUsers,
      blocked: blockedUsers,
      totalSuspended: suspendedUsers.length,
      totalBlocked: blockedUsers.length,
    });
  } catch (error) {
    console.error("Error fetching suspended/blocked users:", error);
    res.status(500).json({
      message: "Failed to fetch suspended/blocked users",
      error: error.message,
    });
  }
});

// Delete suspended/blocked user
adminRouter.delete("/delete-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot delete admin user" });
    }

    // Delete user
    await User.findByIdAndDelete(userId);

    // Delete associated entrepreneur or investor record
    if (user.role === "entrepreneur") {
      await Enterprenuer.deleteOne({ userId: userId });
    } else if (user.role === "investor") {
      await Investor.deleteOne({ userId: userId });
    }

    res.status(200).json({
      message: "User deleted successfully",
      deletedUser: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res
      .status(500)
      .json({ message: "Failed to delete user", error: error.message });
  }
});

// =====================
//  NOTIFICATIONS
// =====================

adminRouter.get("/notifications/:adminId", checkApprovalStatus, async (req, res) => {
  try {
    const { adminId } = req.params;

    // Security: Only allow users to fetch their own notifications, unless they are admin
    if (req.user.role !== "admin" && req.user._id.toString() !== adminId) {
      return res.status(403).json({ message: "Access denied. You can only view your own notifications." });
    }

    await connectDB();
    const notifications = await Notification.find({ recipient: adminId })
      .sort({ createdAt: -1 })
      .populate("sender", "name email role")
      .limit(50);
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
});

adminRouter.put("/notifications/:id/read", checkApprovalStatus, async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    
    // Security check: ensure notification belongs to user
    const notification = await Notification.findById(id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    
    if (req.user.role !== "admin" && notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied." });
    }

    notification.isRead = true;
    await notification.save();
    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notification", error: error.message });
  }
});

adminRouter.put("/notifications/read-all/:adminId", checkApprovalStatus, async (req, res) => {
  try {
    const { adminId } = req.params;
    
    // Security check
    if (req.user.role !== "admin" && req.user._id.toString() !== adminId) {
      return res.status(403).json({ message: "Access denied." });
    }

    await connectDB();
    await Notification.updateMany({ recipient: adminId, isRead: false }, { isRead: true });
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notifications", error: error.message });
  }
});

adminRouter.delete("/notifications/:adminId", checkApprovalStatus, async (req, res) => {
  try {
    const { adminId } = req.params;

    // Security check
    if (req.user.role !== "admin" && req.user._id.toString() !== adminId) {
      return res.status(403).json({ message: "Access denied." });
    }

    await connectDB();
    await Notification.deleteMany({ recipient: adminId });
    res.status(200).json({ message: "Notifications deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete notifications", error: error.message });
  }
});

adminRouter.post("/send-mass-notification", adminOnly, async (req, res) => {
  try {
    const { target, message, userId, senderId } = req.body;
    await connectDB();

    let query = {
      approvalStatus: "approved",
      isBlocked: false,
    };

    if (target === "investors") {
      query.role = "investor";
    } else if (target === "entrepreneurs") {
      query.role = "entrepreneur";
    } else if (target === "specific") {
      if (!userId) {
        return res.status(400).json({ message: "User ID is required for specific target" });
      }
      query._id = userId;
    } else if (target === "all") {
      // Includes both investors and entrepreneurs (already handled by default query)
      query.$or = [{ role: "investor" }, { role: "entrepreneur" }];
    }

    const users = await User.find(query);

    if (users.length === 0) {
      return res.status(404).json({ message: "No eligible users found for this target" });
    }

    const notifications = users.map((u) => ({
      recipient: u._id,
      sender: senderId,
      message: message,
      type: "general",
    }));

    await Notification.insertMany(notifications);

    res.status(200).json({
      message: `Notification sent successfully to ${notifications.length} user(s)`,
      count: notifications.length
    });
  } catch (error) {
    console.error("Error sending mass notification:", error);
    res.status(500).json({ message: "Failed to send notification", error: error.message });
  }
});

export default adminRouter;
