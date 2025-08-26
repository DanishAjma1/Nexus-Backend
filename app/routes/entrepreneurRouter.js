import { Router } from "express";
import User from "../models/user.js";
import { connectDB } from "../config/mongoDBConnection.js";
import Enterprenuer from "../models/enterpreneur.js";

const enterpreneurRouter = Router();
enterpreneurRouter.get("/get-entrepreneurs", async (req, res) => {
  try {
    await connectDB();
    const filter = { role: "entrepreneur" };
    const users = await User.find(filter);
    res.status(200).json({ users });
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

enterpreneurRouter.get("/get-entrepreneur-by-id/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const filter= {userId:id};
    const entrepreneur = await Enterprenuer.findOne(filter).populate("userId","-password");

    res.status(200).json({
      message: "User fetched successfully",
      entrepreneur,
    });
  } catch (err) {
    res.status(400).json(err.message);
  }
});
enterpreneurRouter.put("/update-profile/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const filter = { userId: id };

    const update = {
      ...req.body
    };
    const options = {
      new: true,
      upsert: true,
      runValidators: true,
    };
    const entrepreneur = await Enterprenuer.findOneAndUpdate(
      filter,
      update,
      options
    );
    res.status(200).json(entrepreneur);
  } catch (err) {
    res.status(400).json(err.message);
  }
});

export default enterpreneurRouter;
