import express from "express";
import CollaborationRequest from "../models/collaborationRequest.js";
import { connectDB } from "../config/mongoDBConnection.js";
const collaborationRouter = express.Router();

collaborationRouter.post("/save-request", async (req, res) => {
  try {
    await connectDB();
    const filter = { inves_id: req.body.inves_id };
    let request = await CollaborationRequest.findOne(filter);
    if (request) {
      res.status(404).json({ message: "request already sent" });
      return;
    }
    request = new CollaborationRequest(req.body);
    await request.save();
    res.status(201).json({ message: "request sent" });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error during save request : " + error.message });
  }
});

collaborationRouter.get(
  "/get-request-for-enterpreneur/:enter_id",
  async (req, res) => {
    try {
      await connectDB();
      const { enter_id } = req.params;
      const filter = { enter_id };
      const requests = await CollaborationRequest.find(filter);
      res.status(201).json({ requests, message: "request sent" });
    } catch (error) {
      res
        .status(400)
        .json({ message: "Error during fetch requests : " + error.message });
    }
  }
);


collaborationRouter.put(
  "/update-status",
  async (req, res) => {
    try {
      await connectDB();
      const { requestId, newStatus } = req.body;
      const filter = { _id: requestId };
      const request = await CollaborationRequest.findOne(filter);
      request.requestStatus = newStatus;
      await request.save();
      res.status(201).json({ request, message: "request sent" });
    } catch (error) {
      res
        .status(400)
        .json({ message: "Error during fetch requests : " + error.message });
    }
  }
);


collaborationRouter.post("/check-request-for-investor", async (req, res) => {
  try {
    await connectDB();
    console.log("Incoming body:", req.body);

    const { inves_id, enter_id } = req.body;
    const filter = { inves_id, enter_id };

    const request = await CollaborationRequest.findOne(filter);
    res.status(200).json({ request, message: "request found" });
  } catch (error) {
    console.error("check-request-for-investor error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

collaborationRouter.post("/get-request-for-investor", async (req, res) => {
  try {
    await connectDB();
    console.log(req.body.inves_id);
    const filter = { inves_id: req.body.inves_id };
    const requests = await CollaborationRequest.find(filter);
    res.status(201).json({ requests, message: "request fetched" });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error during fetch requests : " + error.message });
  }
});

export default collaborationRouter;
