import { Router } from "express";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import sendMailToUser from "../utils/addToMailList.js";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/mongoDBConnection.js";
const authRouter = Router();

//Resgister User
authRouter.post("/register", async (req, res) => {
  try {
    await connectDB();
    const { role } = req.body;
    let user;
    const userfound = await User.findOne({ email: req.body.email });
    if (userfound) {
      return res.status(400).json({ message: "User already exists" });
    }
    const encryptedPassword = await bcrypt.hash(req.body.password, 10);
    user = new User({ ...req.body, password: encryptedPassword });

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
      message: "user registered succssfully..",
      token,
      user: {
        ...userObj,
        userId: userObj._id,
        _id: undefined,
      },
    });
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ message: "Failed to register a user.." + err.message });
  }
});

//Logging in..
authRouter.post("/login", async (req, res) => {
  try {
    console.log(req.body);
    await connectDB();
    let user;
    user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "The user not found please register first.." });
    }

    const isMatch = await bcrypt.compare(req.body.password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (user.role !== req.body.role) {
      return res
        .status(400)
        .json({ message: "You are trying to login in with wrong role.." });
    }

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
      message: "signed in successfully..",
      token,
      user: {
        ...userObj,
        userId: userObj._id,
        _id: undefined,
      },
    });
  } catch (err) {
    console.log(err);
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

    const info = await sendMailToUser(email, message, sub);
    return res
      .status(200)
      .json({ success: true, message: "Email sent successfully!", info, user });
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
    await User.findByIdAndUpdate(id, {
      password: encryptedPassword,
    });
    res.status(200).json({ message: "password updated successfully." });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to password update." });
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

export default authRouter;
