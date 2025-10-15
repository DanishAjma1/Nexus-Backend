import { Router } from "express";
import User from "../models/user.js";
import { connectDB } from "../config/mongoDBConnection.js";
import Enterprenuer from "../models/enterpreneur.js";
import mongoose from "mongoose";

const enterpreneurRouter = Router();
enterpreneurRouter.get("/get-entrepreneurs", async (req, res) => {
  try {
    await connectDB();
    const entrepreneurs = await User.aggregate([
      {
        $match: {
          role: "entrepreneur",
        },
      },
      {
        $lookup: {
          from: "enterpreneurs",
          let: { user_id: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", "$$user_id"] } } },
            {
              $project: {
                startupName: 1,
                industry: 1,
                foundedYear: 1,
                pitchSummary: 1,
                fundingNeeded: 1,
                teamSize: 1,
              },
            },
          ],
          as: "userInfo",
        },
      },
      {
        $unwind: {
          path: "$userInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          userId: "$_id",
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$$ROOT", "$userInfo"],
          },
        },
      },
      {
        $project: {
          password: 0,
          __v: 0,
          _id: 0,
          userInfo: 0,
        },
      },
    ]);
    res.status(200).json({ entrepreneurs });
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

enterpreneurRouter.get("/get-entrepreneur-by-id/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const entrepreneur = await User.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
          role: "entrepreneur",
        },
      },
      {
        $lookup: {
          from: "enterpreneurs",
          localField: "_id",
          foreignField: "userId",
          as: "userInfo",
        },
      },
      {
        $unwind: {
          path: "$userInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$$ROOT", "$userInfo"],
          },
        },
      },
      {
        $project: {
          password: 0,
          __v: 0,
          _id: 0,
          userInfo: 0,
        },
      },
    ]);

    res.status(200).json({ entrepreneur: entrepreneur[0] || null });
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
      ...req.body,
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

enterpreneurRouter.get("/get-successful-entrepreneurs", async (req, res) => {
  try {
    await connectDB();
    const entrepreneurs = await Enterprenuer.find({})
      .sort({ foundedYear: -1, teamSize: -1 })
      .limit(3);
    res.json(entrepreneurs);
  } catch (error) {
    res.status(400).json(error.message);
  }
});

enterpreneurRouter.get("/get-successful-entrepreneurs", async (req, res) => {
  try {
    await connectDB();
    const entrepreneurs = await Enterprenuer.find({})
      .sort({ foundedYear: -1, teamSize: -1 })
      .limit(3);
    res.json(entrepreneurs);
  } catch (error) {
    res.status(400).json(error.message);
  }
});


export default enterpreneurRouter;
