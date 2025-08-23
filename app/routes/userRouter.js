import { Router } from "express";
import User from "../models/user.js";
import multer from "multer";
import { connectDB } from "../config/mongoDBConnection.js";
import fs from "fs";

const userRouter = Router();
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
const upload = multer({ storage });
userRouter.post(
  "/update-profile/:id",
  upload.single("avatarUrl"),
  async (req, res) => {
    try {
      const { id } = req.params;
      await connectDB();
      console.log(req.body);
      const { name, bio, location } = req.body;
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
          { new: true, select: "-password" }
        ).lean();
      } else {
        user = await User.findByIdAndUpdate(
          id,
          { name, bio, location, avatarUrl: uri },
          { new: true, select: "-password" }
        ).lean();
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { _id, password, __v, ...rest } = user;

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

userRouter.get("/get-investors", async (req, res) => {
  try {
    await connectDB();
    const users = await User.find({ role: "investor" }).select(
      "-password -_id"
    );
    res.status(200).json({ users, message: "fetched successfully.." });
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

userRouter.get("/get-investors/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.body;
    const userDoc = await User.findOne({ _id: id })
      .select("-password -_id")
      .lean();

    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = { userId: id, ...userDoc };

    res.status(200).json({
      message: "User fetched successfully",
      user,
    });
  } catch (err) {
    res.status(400).json({ message: err });
  }
});
userRouter.get("/get-enterpreneurs", async (req, res) => {
  try {
    await connectDB();
    const users = await User.find({ role: "enterpreneur" });
    res.status(200).json({ users });
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

userRouter.get("/get-enterpreneurs/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const userDoc = await User.findOne({ _id: id })
      .select("-password -_id")
      .lean();

    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = { userId: id, ...userDoc };

    res.status(200).json({
      message: "User fetched successfully",
      user,
    });
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

export default userRouter;
