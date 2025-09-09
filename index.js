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

const app = express();
const server = createServer(app);

const IO = SocketListeners(server);

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
app.use("/requests",collaborationRouter);
app.use("/conversation", conversationRouter);
app.use("/message", messageRouter);
app.use("/user", userRouter);
app.use("/entrepreneur", enterpreneurRouter);
app.use("/investor", investorRouter);
server.listen(5000, () => {
  console.log("server is listening on port 5000");
});
