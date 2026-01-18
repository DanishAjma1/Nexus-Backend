import { Router } from "express";
import User from "../models/user.js";
import { connectDB } from "../config/mongoDBConnection.js";
import Enterprenuer from "../models/enterpreneur.js";
import mongoose from "mongoose";
import multer from "multer";
import fs from "fs";

//  Multer Storage (Same as userRouter)
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

const enterpreneurRouter = Router();
enterpreneurRouter.get("/get-entrepreneurs", async (req, res) => {
  try {
    await connectDB();
    const entrepreneurs = await User.aggregate([
      {
        $match: {
          role: "entrepreneur",
          approvalStatus: "approved",
          isBlocked: { $ne: true },
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
                fundingHistory: 1,
                valuation: 1,
                preSeedStatus: 1,
                seedStatus: 1,
                seriesAStatus: 1,
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
          approvalStatus: "approved",
          isBlocked: { $ne: true },
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

    if (entrepreneur && entrepreneur.length > 0) {
        console.log(`Fetched Entrepreneur ${id}: FundingHistory Length:`, entrepreneur[0].fundingHistory?.length || 0);
        console.log(`Fetched Entrepreneur ${id}: FundingHistory Data:`, entrepreneur[0].fundingHistory);
    } 

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

    // Set approval status to pending when profile is first created/updated
    // Only set to pending if it's a new document and not already approved
    if (options.upsert) {
      const user = await User.findById(id);
      if (user && user.approvalStatus !== "approved") {
        user.approvalStatus = "pending";
        await user.save();
      }
    }

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

// --- Team Management Endpoints ---

// Add Team Member
enterpreneurRouter.post(
  "/add-team-member/:id",
  upload.single("avatarUrl"),
  async (req, res) => {
    try {
      await connectDB();
      const { id } = req.params;
      const { name, role } = req.body; // role can be string or array

      let uri = "";
      if (req.file) {
        uri = `${req.protocol}://${req.get("host")}/${req.file.destination}${
          req.file.filename
        }`;
      }

      // Ensure roles is array
      const rolesArray = Array.isArray(role) ? role : [role];

      const newMember = {
        name,
        role: rolesArray,
        avatarUrl: uri,
      };

      const entrepreneur = await Enterprenuer.findOneAndUpdate(
        { userId: id },
        { $push: { team: newMember } },
        { new: true, upsert: true }
      );

      // Also update teamSize if needed, or let it be manual
       // Option: Increment teamSize automatically
      entrepreneur.teamSize = (entrepreneur.teamSize || 0) + 1;
      await entrepreneur.save();

      res.status(200).json(entrepreneur);
    } catch (err) {
      console.error(err);
      res.status(400).json(err.message);
    }
  }
);

// Update Team Member
enterpreneurRouter.put(
  "/update-team-member/:id/:memberId",
  upload.single("avatarUrl"),
  async (req, res) => {
    try {
      await connectDB();
      const { id, memberId } = req.params;
      const { name, role } = req.body;

      let updateFields = {};
      if (name) updateFields["team.$.name"] = name;
      if (role) {
         updateFields["team.$.role"] = Array.isArray(role) ? role : [role];
      }

      if (req.file) {
        const uri = `${req.protocol}://${req.get("host")}/${req.file.destination}${
          req.file.filename
        }`;
        updateFields["team.$.avatarUrl"] = uri;
      }

      const entrepreneur = await Enterprenuer.findOneAndUpdate(
        { userId: id, "team._id": memberId },
        { $set: updateFields },
        { new: true }
      );

      if (!entrepreneur) {
          return res.status(404).json({message: "Entrepreneur or team member not found"});
      }

      res.status(200).json(entrepreneur);
    } catch (err) {
      console.error(err);
      res.status(400).json(err.message);
    }
  }
);

// Delete Team Member
enterpreneurRouter.delete(
  "/delete-team-member/:id/:memberId",
  async (req, res) => {
    try {
      await connectDB();
      const { id, memberId } = req.params;

      const entrepreneur = await Enterprenuer.findOneAndUpdate(
        { userId: id },
        { $pull: { team: { _id: memberId } } },
        { new: true }
      );
      
      if (entrepreneur) {
           entrepreneur.teamSize = Math.max(0, (entrepreneur.teamSize || 1) - 1);
           await entrepreneur.save();
      }

      res.status(200).json(entrepreneur);
    } catch (err) {
      console.error(err);
      res.status(400).json(err.message);
    }
  }
);

export default enterpreneurRouter;
