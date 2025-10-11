import { Router } from "express";
import Investor from "../models/investor.js";
import { connectDB } from "../config/mongoDBConnection.js";
import mongoose from "mongoose";
import User from "../models/user.js";

const investorRouter = Router();
investorRouter.get("/get-investors", async (req, res) => {
  try {
    await connectDB();
    const investors = await User.aggregate([
      {
        $match: {
          role: "investor",
        },
      },
      {
        $lookup: {
          from: "investors",
          let: { user_id: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", "$$user_id"] } } },
            {
              $project: {
                investmentInterests: 1,
                investmentStage: 1,
                totalInvestments: 1,
                totalInvestments: 1,
                maximumInvestment: 1,
                minimumInvestment: 1,
              },
            },
          ],
          as: "investorInfo",
        },
      },
      {
        $unwind: {
          path: "$investorInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields:{
          userId:"$_id"
        }
      },
      {
        $replaceRoot: {
          newRoot: { $mergeObjects: ["$$ROOT", "$investorInfo"] },
        },
      },
      {
        $project: {
          _id: 0,
          __v: 0,
          password: 0,
          investorInfo: 0,
        },
      },
    ]);
    res.status(200).json({ investors });
  } catch (err) {
    res.status(400).json(err.message);
  }
});

investorRouter.get("/get-investor-by-id/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const investor = await User.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
          role: "investor",
        },
      },
      {
        $lookup: {
          from: "investors",
          localField: "_id",
          foreignField: "userId",
          as: "investorInfo",
        },
      },
      {
        $unwind: {
          path: "$investorInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $replaceRoot: {
          newRoot: { $mergeObjects: ["$$ROOT", "$investorInfo"] },
        },
      },
      {
        $project: {
          password: 0,
          __v:0,
          investorInfo: 0,
        },
      },
    ]);
    console.log(investor);
    res.status(200).json({ investor: investor[0] || null });
  } catch (err) {
    res.status(400).json(err.message);
  }
});

investorRouter.put("/update-profile/:id", async (req, res) => {
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
    await Investor.findOneAndUpdate(filter, update, options);
    res.status(200).json({message:"Data updated successfully."});
  } catch (err) {
    res.status(400).json(err.message);
  }
});

export default investorRouter;
