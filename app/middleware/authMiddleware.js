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
    if (role === "investor" || role === "entrepreneur" || role === "admin" ) {
      const filter = { role: req.body.role, email: req.body.email };
      const userfound = await User.findOne(filter);

      if (userfound) {
        return res.status(400).json({ message: "User already exists" });
      }
    } else {
      return res.status(400).json({ message: "This role isn't exist." });
    }

    const encryptedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({ ...req.body, password: encryptedPassword });
    const userObject = user.safeDataForAuth();

    const token = jwt.sign(userObject, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    await user.save();

    res.status(201).json({
      message: "user registered succssfully..",
      token,
      user: { ...userObject },
    });
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ message: "Failed to register a user: " + err.message });
  }
});

//Logging in..
authRouter.post("/login", async (req, res) => {
  try {
    console.log(req.body);
    await connectDB();
    const user = await User.findOne({ email: req.body.email }).select(
      "+password"
    );
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

    const userObjectForToken = user.safeDataForAuth();
    const token = jwt.sign(userObjectForToken, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const userObj = user.afterLoggedSafeData();
    res.status(200).json({
      message: "signed in successfully..",
      token,
      user: { ...userObj },
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
    
    let user = await User.findOne({email:userInfo.email});
    if (!user) {
      user = new User({
        name: userInfo.name,
        email: userInfo.email,
        role: role,
      });
      await user.save();
    } else {
      if (user.role !== req.body.role) {
        return res
          .status(400)
          .json({ message: "You are trying to login in with wrong role.." });
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
