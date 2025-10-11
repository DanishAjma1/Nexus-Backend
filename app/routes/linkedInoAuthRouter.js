import express from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
const linkedinRouter = express.Router();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

linkedinRouter.get("/", (req, res) => {
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=openid%20profile%20email`;
  res.redirect(authUrl);
});

linkedinRouter.get("/callback", async (req, res) => {
  const { code } = req.query;

  try {
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
    const userInfo = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = {
      name: userInfo.data.name,
      email: userInfo.data.email,
    };
    const loginToken = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

    const redirect_url = `${process.env.FRONTEND_URL}/login-with-oauth?token=${loginToken}`;
    res.redirect(redirect_url);
  } catch (error) {
    console.error(
      "OAuth callback error:",
      error.response?.data || error.message
    );
    res.status(500).send("OAuth Error");
  }
});

export default linkedinRouter;