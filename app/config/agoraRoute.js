import pkg, { RtcTokenBuilder } from "agora-access-token";
const { RtcRole } = pkg;
import express from "express";
const agoraRouter = express.Router();

const APP_ID = "5e3db4d74aaa43ff8eeee3ad9f08efd8";
const APP_CERTIFICATE = "c2a91e0fcbd64e8a87e9cb52136aaed7"; // Only needed if using App Certificate

agoraRouter.get("/rtc/:channel/:uid", (req, res) => {
  try {
    const channelName = req.params.channel;
    const uid = req.params.uid;
    const role = RtcRole.PUBLISHER; // Or RtcRole.AUDIENCE
    const expirationTimeInSeconds = 3600; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    console.log(uid + "  " + channelName + " " + APP_ID);

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      String(channelName),
      String(uid),
      role,
      privilegeExpiredTs
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default agoraRouter;
