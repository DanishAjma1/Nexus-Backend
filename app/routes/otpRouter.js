import express from "express";
import { sendOtpMail } from "../utils/approvalMailService.js";
import User from "../models/user.js";

const otpRouter = express.Router();

// In-memory store for OTPs (for demo; use Redis or DB in production)
const otpStore = {};

// Send OTP endpoint
otpRouter.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000; // 10 min
  otpStore[email] = { otp, expires };
  try {
    await sendOtpMail(email, otp);
    res.json({ message: "OTP sent" });
  } catch (err) {
    res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
});

// Verify OTP endpoint
otpRouter.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });
  const record = otpStore[email];
  if (!record) return res.status(400).json({ message: "No OTP sent to this email" });
  if (Date.now() > record.expires) return res.status(400).json({ message: "OTP expired" });
  if (record.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
  delete otpStore[email];
  res.json({ message: "OTP verified" });
});

export default otpRouter;
