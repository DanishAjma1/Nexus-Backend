import express from "express";
import CollaborationRequest from "../models/collaborationRequest.js";
import Notification from "../models/notification.js";
import { connectDB } from "../config/mongoDBConnection.js";
const collaborationRouter = express.Router();

collaborationRouter.post("/save-request", async (req, res) => {
  try {
    await connectDB();
    const filter = { inves_id: req.body.inves_id, enter_id: req.body.enter_id };
    let request = await CollaborationRequest.findOne(filter);
    if (request) {
      res.status(404).json({ message: "request already sent" });
      return;
    }
    request = new CollaborationRequest(req.body);
    await request.save();

    // Create Notification for Entrepreneur
    const notification = new Notification({
      recipient: req.body.enter_id,
      sender: req.body.inves_id,
      message: `New collaboration request from an investor`,
      type: "general",
      link: `/dashboard/entrepreneur/requests`, // Link to the new requests page
    });
    await notification.save();

    res.status(201).json({ message: "request sent", request });
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
      // Populate investor details to show in the list
      const requests = await CollaborationRequest.find(filter).populate("inves_id", "name email avatarUrl");
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
      if (!request) {
         return res.status(404).json({ message: "Request not found" });
      }
      request.requestStatus = newStatus;
      await request.save();

      // Notify Investor if accepted
      if (newStatus === "accepted") {
        const notification = new Notification({
          recipient: request.inves_id,
          sender: request.enter_id,
          message: `Your collaboration request has been accepted!`,
          type: "general",
          link: `/profile/entrepreneur/${request.enter_id}`, 
        });
        await notification.save();
      }

      res.status(201).json({ request, message: "request updated" });
    } catch (error) {
      res
        .status(400)
        .json({ message: "Error during update request : " + error.message });
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
