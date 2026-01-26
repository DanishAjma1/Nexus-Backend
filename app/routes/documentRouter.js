import { Router } from "express";
import Document from "../models/document.js";
import multer from "multer";
import { connectDB } from "../config/mongoDBConnection.js";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import User from "../models/user.js";
import Notification from "../models/notification.js";
import { emitNotifications } from "../utils/notificationEmitter.js";

const documentRouter = Router();

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/documents/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPG, or PNG files are allowed!"), false);
    }
  },
});

// Helper function to get user from token
const getUserFromToken = async (req) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded._id;
    return userId;
  } catch (error) {
    return null;
  }
};

// Upload or update document
documentRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = await getUserFromToken(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { type } = req.body;
    if (!type || !req.file) {
      return res.status(400).json({ message: "Type and file are required" });
    }

    await connectDB();

    const fileUrl = `/uploads/documents/${req.file.filename}`;
    const fileName = req.file.originalname;

    // Check if document of this type already exists for this user
    let document = await Document.findOne({ userId, type });

    if (document) {
      // Delete old file if it exists
      const oldFilePath = path.join(process.cwd(), document.fileUrl.startsWith('/') ? document.fileUrl.substring(1) : document.fileUrl);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
      
      document.fileUrl = fileUrl;
      document.fileName = fileName;
      document.uploadedAt = new Date();
      await document.save();
    } else {
      document = new Document({
        userId,
        type,
        fileUrl,
        fileName,
      });
      await document.save();
    }

    // Mark KYC as pending when legal docs are uploaded
    if (type === "Government ID (CNIC/Passport)" || type === "Selfie Photo") {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          kycStatus: {
            status: "pending",
            reviewedAt: null,
            reviewedBy: null,
            note: null,
          },
        },
        { new: true }
      ).lean();

      // Notify all admins for real-time KYC review
      const admins = await User.find({ role: "admin" }, "_id").lean();
      if (admins.length > 0 && user) {
        const notifications = admins.map((admin) => ({
          recipient: admin._id,
          sender: user._id,
          message: `New KYC upload from ${user.name || "user"}. Please review ID and selfie.`,
          type: "kyc_review",
          link: "/admin/all-users",
        }));
        const saved = await Notification.insertMany(notifications);
        await emitNotifications(saved);
      }
    }

    res.status(200).json({
      message: "Document uploaded successfully",
      document,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get all documents for user
documentRouter.get("/", async (req, res) => {
  try {
    const userId = await getUserFromToken(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await connectDB();
    const documents = await Document.find({ userId });
    res.status(200).json({ documents });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get documents for a specific user (for investor view)
documentRouter.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await connectDB();
    const documents = await Document.find({ userId });
    res.status(200).json({ documents });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete document
documentRouter.delete("/:id", async (req, res) => {
  try {
    const userId = await getUserFromToken(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await connectDB();
    const { id } = req.params;

    const document = await Document.findOne({ _id: id, userId });
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Delete file
    const filePath = path.join(process.cwd(), document.fileUrl.startsWith('/') ? document.fileUrl.substring(1) : document.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Document.findByIdAndDelete(id);

    res.status(200).json({ message: "Document deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default documentRouter;
