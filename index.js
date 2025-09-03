import express from "express";
import cors from "cors";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import authRouter from "./app/middleware/authMiddleware.js";
import userRouter, { setOnline } from "./app/routes/userRouter.js";
import enterpreneurRouter from "./app/routes/entrepreneurRouter.js";
import investorRouter from "./app/routes/investorRouter.js";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import messageRouter from "./app/routes/messageRouter.js";
import conversationRouter from "./app/routes/conversationRouter.js";

const app = express();
const server = createServer(app);

const IO = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

// Use correct Redis URL (adjust for your setup)
const pubClient = createClient({ url: "redis://127.0.0.1:6379" });
const subClient = pubClient.duplicate();

pubClient.on("error", (err) => console.error("Redis Pub Error", err));
subClient.on("error", (err) => console.error("Redis Sub Error", err));

(async () => {
  await pubClient.connect();
  await subClient.connect();
  IO.adapter(createAdapter(pubClient, subClient));
})();

IO.on("connection", (socket) => {
  console.log("user joined with id " + socket.id);

  // when user joins
  socket.on("join", async (userId) => {
    try {
      console.log(userId);
      await pubClient.set(`user:${userId}`, socket.id);
      await setOnline(userId, true);
      console.log(`User ${userId} is online`);
    } catch (err) {
      console.error("Redis error in join:", err);
    }
  });

  //when user typing
  socket.on("typing",async(receiverId)=>{
    console.log(receiverId)
    try {
      const socketReceiverId = await pubClient.get(`user:${receiverId}`);
      if(socketReceiverId){
        socket.to(socketReceiverId).emit("is-typing");
      }else{
        console.log("user is offline");
      }
    } catch (error) {
      console.error("Redis error while typing:", err);
    }
  })

  // when user says hi
  socket.on("say-hi", async (receiverId) => {
    try {
      const socketReceiverId = await pubClient.get(`user:${receiverId}`);

      if (socketReceiverId) {
        console.log("message delivered");
        socket.to(socketReceiverId).emit("hi");
      } else {
        console.log(`No active socket found for receiver ${receiverId}`);
      }
    } catch (err) {
      console.error("Redis error in say-hi:", err);
    }
  });

  //  when user send message
  socket.on("send-message", async (message) => {
    try {
      const socketReceiverId = await pubClient.get(
        `user:${message.receiverId}`
      );
      if (!message) console.log("there is not message returned..");
      else socket.to(socketReceiverId).emit("received-message", message);
    } catch (error) {
      console.error("Redis error in send-message:", error);
    }
  });

  // when user disconnects
  socket.on("disconnect", async () => {
    try {
      const keys = await pubClient.keys("user:*");
      for (const key of keys) {
        const userSocketId = await pubClient.get(key);
        if (userSocketId === socket.id) {
          await pubClient.del(key);
          const userId = key.split(":")[1];
          await setOnline(userId, false);
          socket.emit("check-user-status");
          console.log("client removed: " + key);
        }
      }
    } catch (err) {
      console.error("Redis error in disconnect:", err);
    }
  });
});

app.use(cookieParser());
app.use(bodyParser.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use("/uploads", express.static("uploads"));
app.use("/auth", authRouter);
app.use("/conversation", conversationRouter);
app.use("/message", messageRouter);
app.use("/user", userRouter);
app.use("/entrepreneur", enterpreneurRouter);
app.use("/investor", investorRouter);
server.listen(5000, () => {
  console.log("server is listening on port 5000");
});
