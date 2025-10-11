import express from "express";
import cors from "cors";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import authRouter from "./app/middleware/authMiddleware.js";
import userRouter from "./app/routes/userRouter.js";
import enterpreneurRouter from "./app/routes/entrepreneurRouter.js";
import investorRouter from "./app/routes/investorRouter.js";
import messageRouter from "./app/routes/messageRouter.js";
import conversationRouter from "./app/routes/conversationRouter.js";
import { SocketListeners } from "./app/utils/socketListeners.js";
import collaborationRouter from "./app/routes/collaborationRouter.js";
import agoraRouter from "./app/config/agoraRoute.js";
import linkedinRouter from "./app/routes/linkedInOauthRouter.js";
import googleRouter from "./app/routes/googleOauthRouter.js";
const app = express();
const server = createServer(app);

SocketListeners(server);

app.use(cookieParser());
app.use(bodyParser.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use("/uploads", express.static("uploads"));
app.use("/auth", authRouter);
app.use("/auth/linkedin", linkedinRouter);
app.use("/auth/google", googleRouter);
app.use("/requests", collaborationRouter);
app.use("/conversation", conversationRouter);
app.use("/message", messageRouter);
app.use("/user", userRouter);
app.use("/entrepreneur", enterpreneurRouter);
app.use("/investor", investorRouter);
app.use("/agora", agoraRouter);
server.listen(5000, () => {
  console.log("server is listening on port 5000");
});
