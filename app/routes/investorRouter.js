import { Router } from "express";
import User from "../models/user.js";
import { connectDB } from "../config/mongoDBConnection.js";

const investorRouter = Router();
investorRouter.get("/get-investors", async (req, res) => {
  try {
    await connectDB();
    const users = await User.find({ role: "investor" }).select(
      "-password"
    );
    res.status(200).json({ users, message: "fetched successfully.." });
  } catch (err) {
    res.status(400).json(err.message);
  }
});

investorRouter.get("/get-investor-by-id/:id", async (req, res) => {
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
    res.status(400).json(err.message);
  }
});
export default investorRouter;
