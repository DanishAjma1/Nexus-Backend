import { Router } from "express";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import sendMailToUser from "../utils/addToMailList.js";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/mongoDBConnection.js";

const authRouter = Router();

/* -------------------- REGISTER -------------------- */
authRouter.post("/register", async (req, res) => {
  try {
    await connectDB();
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const encryptedPassword = await bcrypt.hash(password, 10);

    // Create new user with timestamps and online status
    const user = new User({
      ...req.body,
      password: encryptedPassword,
      lastLoginTime: new Date(), // ✅ Mark registration/login time
      isOnline: true, // ✅ Mark online after registration
      totalSessionDuration: 0, // initialize if not already in schema
    });

    await user.save();

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.__v;

    res.status(201).json({
      message: "User registered successfully.",
      token,
      user: {
        ...userObj,
        userId: userObj._id,
        _id: undefined,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to register user: " + err.message });
  }
});

/* -------------------- LOGIN -------------------- */
authRouter.post("/login", async (req, res) => {
  try {
    await connectDB();
    const { email, password, role } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found. Please register first." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    if (user.role !== role)
      return res.status(400).json({ message: "Wrong role selected." });

    const currentLoginTime = new Date();

    // 🕒 Calculate time since last logout
    if (user.lastLogoutTime) {
      const diffMs = currentLoginTime - user.lastLogoutTime;
      const diffHours = diffMs / (1000 * 60 * 60); 
      user.lastLogoutDuration = diffHours.toFixed(2);
    } else {
      user.lastLogoutDuration = 0;
    }

    user.lastLoginTime = currentLoginTime;
    user.isOnline = true;

    await user.save();

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.__v;

    res.status(200).json({
      message: "Signed in successfully.",
      token,
      user: { ...userObj, userId: userObj._id, _id: undefined },
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Login failed: " + err.message });
  }
});


/* -------------------- LOGOUT -------------------- */
authRouter.post("/logout", async (req, res) => {
  try {
    await connectDB();
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) return res.status(403).json({ message: "Invalid or expired token" });

      const user = await User.findById(decoded.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const logoutTime = new Date();
      user.lastLogoutTime = logoutTime;
      user.isOnline = false;

      // Calculate session duration if login time exists
      if (user.lastLoginTime) {
        const durationMs = logoutTime - user.lastLoginTime;
        const durationMinutes = Math.floor(durationMs / (1000 * 60));
        user.totalSessionDuration += durationMinutes;
      }

      await user.save();

      return res.status(200).json({
        message: "User logged out successfully.",
        logoutTime,
        totalSessionDuration: user.totalSessionDuration,
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to log out user." });
  }
});

/* -------------------- SEND MAIL (FORGOT PASSWORD) -------------------- */
authRouter.post("/send-mail", async (req, res) => {
  const { email, message, sub } = req.body;

  try {
    await connectDB();
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User email is not valid" });

    const info = await sendMailToUser(email, message, sub);
    return res
      .status(200)
      .json({ success: true, message: "Email sent successfully!", info, user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: error.toString(),
    });
  }
});

/* -------------------- UPDATE PASSWORD -------------------- */
authRouter.patch("/update-password/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { newPassword } = req.body;
    const encryptedPassword = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(id, {
      password: encryptedPassword,
    });

    res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update password." });
  }
});

/* -------------------- VERIFY TOKEN -------------------- */
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

export default authRouter;
