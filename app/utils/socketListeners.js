import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { setOnline } from "../routes/userRouter.js";

export const SocketListeners = (server) => {
  const IO = new Server(server, {
    cors: {
      origin: "http://localhost:5173", // Vite dev server
      methods: ["GET", "POST"],
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

    const keys = await pubClient.keys("user:*");
    if (keys.length > 0) {
      await pubClient.del(keys);
      console.log("Cleared stale user mappings on restart");
    }
  })();

  //  Socket.io connnection
  IO.on("connection", (socket) => {
    console.log("socket on with id " + socket.id);

    // start call
    socket.on("start-call", async ({ from, to, roomId }) => {
      try {
        const socketReceiverId = await pubClient.get(`user:${to}`);
        const socketCallerId = await pubClient.get(`user:${from}`);
        if(socketReceiverId){
          socket.to(socketReceiverId).emit("incoming-call", { from, roomId });
        }else{
          socket.to(socketCallerId).emit("receiver-offline");
        }
        
      } catch (error) {
        console.log("Redis error during start call.." + error);
      }
    });

    // Callee accpets
    socket.on("accept-call", async ({ to }) => {
      const callerSocketId = await pubClient.get(`user:${to}`);
      if (callerSocketId) {
        IO.to(callerSocketId).emit("call-accepted");
      }
    });

    // Callee reject
    socket.on("reject-call", async ({ to }) => {
      const callerSocketId = await pubClient.get(`user:${to}`);
      if (callerSocketId) {
        console.log("call rejected");
        IO.to(callerSocketId).emit("call-rejected");
      }
    });

    //  Call ended
    socket.on("end-call", async ({ to,roomId }) => {
      console.log(to);
      const callerSocketId = await pubClient.get(`user:${to}`);
      if (callerSocketId) {
        console.log("call ended");
        IO.to(roomId).emit("call-ended");
      }
    });

    //  Join room
    socket.on("join-room", ({ roomId }) => {
      socket.join(roomId);
      socket.to(roomId).emit("user-joined", socket.id);
    });

    // Offer
    socket.on("offer", ({ roomId, offer }) => {
      socket.to(roomId).emit("offer", { offer, sender: socket.id });
    });

    // Forward answer
    socket.on("answer", ({ roomId, answer }) => {
      socket.to(roomId).emit("answer", { sender: socket.id, answer });
    });

    // Forward ICE candidates
    socket.on("ice-candidate", ({ roomId, candidate }) => {
      socket.to(roomId).emit("ice-candidate", { sender: socket.id, candidate });
    });

    // **************** Messages linsteners*******************

    // when user joins
    socket.on("join", async (userId) => {
      try {
        // replace old mapping with new one
        await pubClient.set(`user:${userId}`, socket.id);
        await setOnline(userId, true);
        console.log(`✅ User ${userId} reconnected with socket ${socket.id}`);
      } catch (err) {
        console.error("Redis error in join:", err);
      }
    });

    //  when user typing
    socket.on("typing", async (receiverId) => {
      console.log(receiverId);
      try {
        const socketReceiverId = await pubClient.get(`user:${receiverId}`);
        if (socketReceiverId) {
          socket.to(socketReceiverId).emit("is-typing");
        } else {
          console.log("user is offline");
        }
      } catch (error) {
        console.error("Redis error while typing:", err);
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
            console.log(`❌ User ${userId} went offline (socket ${socket.id})`);
          }
        }
      } catch (err) {
        console.error("Redis error in disconnect:", err);
      }
    });
  });
  return IO;
};
