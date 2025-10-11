import express from "express";
import { google } from "googleapis";
import jwt from "jsonwebtoken";
const googleRouter = express.Router();

googleRouter.get("/", (req, res) => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["email profile openid"],
  });
  res.redirect(url);
});

googleRouter.get("/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oAuth2Client,
      version: "v2",
    });
    const { data } = await oauth2.userinfo.get();
    console.log("User Info:", data);

    const appToken = jwt.sign(
      {
        name: data.name,
        email: data.email,
        provider: "google",
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    res.redirect(
      `${process.env.FRONTEND_URL}/login-with-oauth?token=${encodeURIComponent(
        appToken
      )}`
    );
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ error: "Google OAuth authentication failed" });  }
});

export default googleRouter;
