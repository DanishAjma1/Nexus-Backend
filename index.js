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
import { auth } from "express-openid-connect";
import axios from "axios";
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

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:5000/auth/linkedin/callback";

app.get("/auth/linkedin", (req, res) => {
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=openid%20profile%20email`;
  res.redirect(authUrl);
});

app.get("/auth/linkedin/callback", async (req, res) => {
  const { code } = req.query;

  const tokenRes = await axios.post(
    "https://www.linkedin.com/oauth/v2/accessToken",
    null,
    {
      params: {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  const accessToken = tokenRes.data.access_token;

  // Fetch user info via OpenID endpoint
  const userInfo = await axios.get("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  console.log("LinkedIn User Info:", userInfo.data);
});

app.use("/uploads", express.static("uploads"));
app.use("/auth", authRouter);
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
