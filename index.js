import "./loadEnv.js";
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
import googleRouter from "./app/routes/googleOauthRouter.js";
import linkedinRouter from "./app/routes/linkedInoAuthRouter.js";
import adminRouter from "./app/routes/adminRouter.js";
import contactRouter from "./app/routes/contact.js";
import paymentRouter from "./app/routes/paymentRouter.js";
import dealRouter from "./app/routes/dealRouter.js";
import documentRouter from "./app/routes/documentRouter.js";
import industryRouter from "./app/routes/industryRouter.js";
import { startSuspensionChecker } from "./app/utils/suspensionChecker.js";
import { startCampaignChecker } from "./app/utils/campaignChecker.js";
// import stripeWebhook from "./app/routes/stripeWebhook.js";
const app = express();
const server = createServer(app);

const { IO, pubClient } = SocketListeners(server);
export { IO, pubClient };

app.use(cookieParser());
// Mount webhook BEFORE bodyParser because it needs raw body for signature verification
// app.use("/webhook", stripeWebhook);
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
app.use("/admin", adminRouter);
app.use("/contact", contactRouter);
app.use("/payment", paymentRouter);
app.use("/deal", dealRouter);
app.use("/document", documentRouter);
app.use("/industry", industryRouter);

startSuspensionChecker();
startCampaignChecker();

server.listen(5000, () => {
  console.log("server is listening on port 5000");
});
