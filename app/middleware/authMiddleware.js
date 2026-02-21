import { Router } from "express";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import sendMailToUser from "../utils/addToMailList.js";
import {
  sendAdminNewUserNotification,
  sendUserRegistrationNotification,
} from "../utils/approvalMailService.js";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/mongoDBConnection.js";
import { logRiskEvent } from "../routes/adminRouter.js";
import TwoFactorAuth from "./twoFactorAuth.js";
import Entrepreneur from "../models/enterpreneur.js";
import Investor from "../models/investor.js";
import Notification from "../models/notification.js";
import { emitNotifications } from "../utils/notificationEmitter.js";
const authRouter = Router();

let failed_attempts = 0;

const riskEventDetection = (email) => {
  failed_attempts += 1;
  if (failed_attempts > 1) {
    logRiskEvent({
      email,
      eventType: "failed_login",
      riskScore: 10,
      isFraud: false,
    });
  }
  if (failed_attempts > 3) {
    logRiskEvent({
      email,
      eventType: "multiple_time_failed_login",
      riskScore: 20,
      isFraud: failed_attempts >= 7,
    });
  }
};

//Resgister User
authRouter.post("/register", async (req, res) => {
  console.log("=== REGISTER ENDPOINT CALLED ===");
  console.log("Request body:", { email: req.body.email, role: req.body.role });

  try {
    await connectDB();
    const { role, email } = req.body;
    console.log("Processing registration for:", email, "Role:", role);
    if (role === "investor" || role === "entrepreneur" || role === "admin") {
      const filter = { role: req.body.role, email: req.body.email };
      console.log("Searching for user with filter:", filter);
      const userfound = await User.findOne(filter);
      console.log(
        "User search result:",
        userfound
          ? `Found user with status: ${userfound.approvalStatus}`
          : "No user found"
      );

      // If user exists and is rejected, allow re-registration (delete old account)
      if (userfound) {
        console.log("User found:", {
          email: userfound.email,
          approvalStatus: userfound.approvalStatus,
        });

        if (userfound.approvalStatus === "rejected") {
          console.log("User is rejected, deleting old account...");

          // Delete the rejected account
          await User.deleteOne({ _id: userfound._id });

          // Also delete from Entrepreneur or Investor profiles
          if (role === "entrepreneur") {
            await Entrepreneur.deleteOne({ userId: userfound._id });
          } else if (role === "investor") {
            await Investor.deleteOne({ userId: userfound._id });
          }

          console.log(
            "Deleted rejected user, proceeding with new registration"
          );
          // Continue with new registration (don't return here)
        } else {
          // User already exists and is not rejected
          console.log(
            "User exists and is not rejected:",
            userfound.approvalStatus
          );
          riskEventDetection(email);
          return res.status(400).json({ message: "User already exists" });
        }
      }
    } else {
      riskEventDetection(email);
      return res.status(400).json({ message: "This role isn't exist." });
    }

    const encryptedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({ ...req.body, password: encryptedPassword });
    const userObject = user.safeDataForAuth();

    const token = jwt.sign(userObject, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    await user.save();

    // Notify admin about new registration (non-blocking)
    try {
      await sendAdminNewUserNotification(user.email, user.name, user.role);
      await sendUserRegistrationNotification(user.email, user.name, user.role);
      
      // Create in-app notification for all admins
      const admins = await User.find({ role: 'admin' });
      const notificationPromises = admins.map(admin => {
        return new Notification({
          recipient: admin._id,
          sender: user._id,
          message: `New ${user.role} registration: ${user.name} (${user.email})`,
          type: 'registration',
          link: `/dashboard/admin/approvals`
        }).save();
      });
      const savedNotifications = await Promise.all(notificationPromises);
      await emitNotifications(savedNotifications);
    } catch (mailErr) {
      console.error("Failed to send admin new-user notification:", mailErr);
    }

    res.status(201).json({
      message: "user registered succssfully..",
      token,
      user: { ...userObject },
    });
  } catch (err) {
    console.log("Register error:", err);
    res
      .status(500)
      .json({ message: "Failed to register a user: " + err.message });
  }
});

//Logging in..
// authRouter.post("/login", async (req, res) => {
//   try {
//     await connectDB();
//     const user = await User.findOne({ email: req.body.email }).select(
//       "+password"
//     );
//     if (!user) {
//       riskEventDetection(req.body.email);
//       return res
//         .status(404)
//         .json({ message: "The user not found please register first.." });
//     }

//     const isMatch = await bcrypt.compare(req.body.password, user.password);
//     if (!isMatch) {
//       riskEventDetection(req.body.email);
//       return res.status(400).json({ message: "Invalid email or password" });
//     }

//     if (user.role !== req.body.role) {
//       return res
//         .status(400)
//         .json({ message: "You are trying to login in with wrong role.." });
//     }

//     const userObjectForToken = user.safeDataForAuth();
//     const token = jwt.sign(userObjectForToken, process.env.JWT_SECRET, {
//       expiresIn: "1h",
//     });

//     const userObj = user.afterLoggedSafeData();
//     res.status(200).json({
//       message: "signed in successfully..",
//       token,
//       user: { ...userObj },
//     });
//   } catch (err) {
//     console.log(err);
//     res
//       .status(400)
//       .json({ message: "bad request while signing it.." + err.message });
//   }
// });

// Enhanced login with 2FA support
authRouter.post("/login", async (req, res) => {
  try {
    await connectDB();
    // Find the user by both email and the selected role so users with multiple role-accounts
    // (e.g., entrepreneur + investor) authenticate the correct profile.
    const user = await User.findOne({
      email: req.body.email,
      role: req.body.role,
    }).select("+password");

    if (!user) {
      riskEventDetection(req.body.email);
      return res
        .status(404)
        .json({ message: "The user not found please register first.." });
    }

    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
      riskEventDetection(req.body.email);
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (user.role !== req.body.role) {
      return res
        .status(400)
        .json({ message: "You are trying to login in with wrong role.." });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked",
        isBlocked: true,
        blockReason: user.blockReason,
      });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      const now = new Date();
      const suspensionEndDate = new Date(user.suspensionEndDate);

      // If suspension period has ended, auto-unsuspend
      if (now > suspensionEndDate) {
        user.isSuspended = false;
        user.suspensionReason = undefined;
        user.suspensionStartDate = undefined;
        user.suspensionEndDate = undefined;
        user.suspendedBy = undefined;
        await user.save();
      } else {
        // Still suspended
        return res.status(403).json({
          message: "Your account has been suspended",
          isSuspended: true,
          suspensionReason: user.suspensionReason,
          suspensionEndDate: user.suspensionEndDate,
        });
      }
    }

    // Check approval status for entrepreneur and investor
    if (
      (user.role === "entrepreneur" || user.role === "investor") &&
      user.approvalStatus !== "approved"
    ) {
      if (user.approvalStatus === "rejected") {
        return res.status(403).json({
          message: "Your account has been rejected",
          approvalStatus: "rejected",
          reason: user.rejectionReason,
        });
      }

      if (user.approvalStatus === "pending") {
        return res.status(403).json({
          message:
            "Your account is pending admin approval. Please wait for approval notification.",
          approvalStatus: "pending",
        });
      }
    }

    // Get device info
    const deviceInfo = TwoFactorAuth.getDeviceInfo(req);

    // Check if 2FA is required for this device
    const requires2FA = await TwoFactorAuth.is2FARequired(
      user._id,
      deviceInfo.deviceId
    );

    if (user.twoFactorEnabled && requires2FA) {
      // Return partial token for 2FA verification
      const partialToken = jwt.sign(
        {
          userId: user._id,
          email: user.email,
          requires2FA: true,
          deviceInfo: deviceInfo,
        },
        process.env.JWT_SECRET,
        { expiresIn: "10m" } // Short expiry for 2FA token
      );

      return res.status(200).json({
        message: "2FA required",
        requires2FA: true,
        partialToken,
        user: {
          userId: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          twoFactorEnabled: true,
        },
      });
    }

    // If no 2FA required, generate full token
    const userObjectForToken = user.safeDataForAuth();
    const token = jwt.sign(
      {
        ...userObjectForToken,
        deviceId: deviceInfo.deviceId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Add device to trusted devices if 2FA is enabled but not required (trusted device)
    if (user.twoFactorEnabled && !requires2FA) {
      user.addTrustedDevice(deviceInfo);
      await user.save();
    }

    const userObj = user.afterLoggedSafeData();
    res.status(200).json({
      message: "signed in successfully..",
      token,
      user: { ...userObj },
      deviceTrusted: !requires2FA,
    });
  } catch (err) {
    console.log(err);
    res
      .status(400)
      .json({ message: "bad request while signing it.." + err.message });
  }
});

authRouter.post("/login-with-oauth", async (req, res) => {
  try {
    await connectDB();
    const { userToken, role } = req.body;
    const userInfo = jwt.verify(userToken, process.env.JWT_SECRET);

    let user = await User.findOne({ email: userInfo.email, role });
    if (!user) {
      user = new User({
        name: userInfo.name,
        email: userInfo.email,
        role: role,
      });
      await user.save();
    } else {
      if (user.role !== req.body.role) {
        riskEventDetection(req.body.email);
        return res
          .status(400)
          .json({ message: "You are trying to login in with wrong role.." });
      }
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked",
        isBlocked: true,
        blockReason: user.blockReason,
      });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      const now = new Date();
      const suspensionEndDate = new Date(user.suspensionEndDate);

      // If suspension period has ended, auto-unsuspend
      if (now > suspensionEndDate) {
        user.isSuspended = false;
        user.suspensionReason = undefined;
        user.suspensionStartDate = undefined;
        user.suspensionEndDate = undefined;
        user.suspendedBy = undefined;
        await user.save();
      } else {
        // Still suspended
        return res.status(403).json({
          message: "Your account has been suspended",
          isSuspended: true,
          suspensionReason: user.suspensionReason,
          suspensionEndDate: user.suspensionEndDate,
        });
      }
    }

    // Check approval status for entrepreneur and investor
    if (
      (user.role === "entrepreneur" || user.role === "investor") &&
      user.approvalStatus !== "approved"
    ) {
      if (user.approvalStatus === "rejected") {
        return res.status(403).json({
          message: "Your account has been rejected",
          approvalStatus: "rejected",
          reason: user.rejectionReason,
        });
      }

      if (user.approvalStatus === "pending") {
        return res.status(403).json({
          message:
            "Your account is pending admin approval. Please wait for approval notification.",
          approvalStatus: "pending",
        });
      }
    }

    const userObjectForToken = user.safeDataForAuth();
    const token = jwt.sign(userObjectForToken, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const userObj = user.afterLoggedSafeDataForOauth();
    res.status(200).json({
      message: "signed in successfully..",
      token,
      user: { ...userObj },
    });
  } catch (err) {
    console.error(err);
    res
      .status(400)
      .json({ message: "bad request while signing it.." + err.message });
  }
});

// Sending email for forgot password...
authRouter.post("/send-mail", async (req, res) => {
  const { email, message, sub } = req.body;

  try {
    await connectDB();
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User email is not valid" });
    }

    const cleanedUser = user.safeDataForAuth();
    const info = await sendMailToUser(email, message, sub);
    return res.status(200).json({
      success: true,
      message: "Email sent successfully!",
      info,
      user: cleanedUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: error.toString(),
    });
  }
});

authRouter.patch("/update-password/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { newPassword } = req.body;

    const encryptedPassword = await bcrypt.hash(newPassword, 10);
    const user = await User.findByIdAndUpdate(id, {
      password: encryptedPassword,
    });

    const cleanedUser = user.afterLoggedSafeData();
    res
      .status(200)
      .json({ user: cleanedUser, message: "password updated successfully." });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to password update." });
  }
});

// Update password with current password verification
authRouter.patch("/update-password-verify/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }

    const user = await User.findById(id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const encryptedPassword = await bcrypt.hash(newPassword, 10);
    user.password = encryptedPassword;
    await user.save();

    const cleanedUser = typeof user.afterLoggedSafeData === 'function' ? user.afterLoggedSafeData() : user.safeDataForAuth ? user.safeDataForAuth() : null;

    return res.status(200).json({ user: cleanedUser, message: "Password updated successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update password." });
  }
});

//auth middleware

authRouter.get("/verify", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token" });
    res.json({ valid: true, user: decoded });
  });
});

// New endpoint for 2FA verification
authRouter.post("/verify-2fa", async (req, res) => {
  try {
    const { partialToken, code, useBackupCode = false } = req.body;

    // Verify partial token
    const decoded = jwt.verify(partialToken, process.env.JWT_SECRET);

    if (!decoded.requires2FA) {
      return res
        .status(400)
        .json({ message: "Invalid token for 2FA verification" });
    }

    let verified = false;

    if (useBackupCode) {
      // Verify backup code
      verified = await TwoFactorAuth.verifyBackupCode(decoded.userId, code);
    } else {
      // Verify 2FA code
      verified = await TwoFactorAuth.verifyToken(
        decoded.userId,
        code,
        decoded.deviceInfo
      );
    }

    if (!verified) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Get user
    await connectDB();
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate full token
    const userObjectForToken = user.safeDataForAuth();
    const token = jwt.sign(
      {
        ...userObjectForToken,
        deviceId: decoded.deviceInfo.deviceId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userObj = user.afterLoggedSafeData();
    res.status(200).json({
      message: "2FA verification successful",
      token,
      user: { ...userObj },
      deviceTrusted: true,
    });
  } catch (err) {
    console.error(err);
    if (err.name === "TokenExpiredError") {
      return res
        .status(400)
        .json({ message: "Verification session expired. Please login again." });
    }
    res
      .status(400)
      .json({ message: "2FA verification failed: " + err.message });
  }
});

// New endpoint to initiate 2FA setup
authRouter.post("/setup-2fa", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const secretData = await TwoFactorAuth.generateSecret(userId);

    res.status(200).json({
      message: "2FA setup initiated",
      secret: secretData.secret,
      qrCodeUrl: secretData.qrCodeUrl,
      otpauth_url: secretData.otpauth_url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to setup 2FA: " + err.message });
  }
});

// New endpoint to enable 2FA
authRouter.post("/enable-2fa", async (req, res) => {
  try {
    const { userId, secret, code } = req.body;

    if (!userId || !secret || !code) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const backupCodes = await TwoFactorAuth.enable2FA(userId, secret, code);

    res.status(200).json({
      message: "2FA enabled successfully",
      backupCodes,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to enable 2FA: " + err.message });
  }
});

// New endpoint to disable 2FA
authRouter.post("/disable-2fa", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    await TwoFactorAuth.disable2FA(userId);

    res.status(200).json({
      message: "2FA disabled successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to disable 2FA: " + err.message });
  }
});

// New endpoint to get trusted devices
authRouter.get("/trusted-devices/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    await connectDB();
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      trustedDevices: user.trustedDevices || [],
      securitySettings: user.securitySettings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to get trusted devices" });
  }
});

// New endpoint to remove trusted device
authRouter.delete("/trusted-devices/:userId/:deviceId", async (req, res) => {
  try {
    const { userId, deviceId } = req.params;

    await TwoFactorAuth.removeTrustedDevice(userId, deviceId);

    res.status(200).json({
      message: "Trusted device removed successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to remove trusted device" });
  }
});
// Clear all trusted devices for a user
authRouter.delete("/trusted-devices/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    await TwoFactorAuth.clearAllTrustedDevices(userId);

    res.status(200).json({
      message: "All trusted devices removed successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to clear trusted devices" });
  }
});

// Update security settings
authRouter.patch("/security-settings/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { securitySettings } = req.body;

    await connectDB();
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.securitySettings = {
      ...user.securitySettings,
      ...securitySettings,
    };

    await user.save();

    res.status(200).json({
      message: "Security settings updated successfully",
      securitySettings: user.securitySettings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update security settings" });
  }
});

export default authRouter;
