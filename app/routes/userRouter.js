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

userRouter.get("/get-user-by-id/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await connectDB();
    const filter = {
      _id: id,
    };
    const user = await User.findOne(filter).select("-password");
    res.status(200).json({ user });
  } catch (error) {
    console.log(error.message);
    res.status(400).json(error.message);
  }
});

export const setOnline = async (userId,status) => {
  try {
    await connectDB();
    const user = await User.findByIdAndUpdate(userId, { isOnline: status });
    if(user.isOnline)
      return true;
    else
      return false;
  } catch (err) {
    console.error(err);
  }
};

export default userRouter;
