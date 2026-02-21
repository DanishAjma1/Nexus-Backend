import { Router } from 'express';
import webpush from 'web-push';
import { connectDB } from '../config/mongoDBConnection.js';
import User from '../models/user.js';
import NotificationModel from '../models/notification.js';

const router = Router();

// Save subscription (upsert by userId)
router.post('/subscribe', async (req, res) => {
  try {
    await connectDB();
    const { userId, subscription } = req.body;
    if (!userId || !subscription) return res.status(400).json({ message: 'userId and subscription required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.pushSubscription = subscription; // simple field on user model
    await user.save();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to save subscription' });
  }
});

// Unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    await connectDB();
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.pushSubscription = null;
    await user.save();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to unsubscribe' });
  }
});

// Send notification to a user
router.post('/send', async (req, res) => {
  try {
    await connectDB();
    const { userId, payload } = req.body;
    if (!userId || !payload) return res.status(400).json({ message: 'userId and payload required' });

    const user = await User.findById(userId);
    if (!user || !user.pushSubscription) return res.status(404).json({ message: 'Subscription not found' });

    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    webpush.setVapidDetails('mailto:admin@trustbridge.ai', vapidPublic, vapidPrivate);

    try {
      await webpush.sendNotification(user.pushSubscription, JSON.stringify(payload));
      // Optionally log into NotificationModel
      await NotificationModel.create({ recipient: user._id, payload, read: false });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Push send error', err);
      // If subscription is no longer valid, clear it
      if (err.statusCode === 410 || err.statusCode === 404) {
        user.pushSubscription = null;
        await user.save();
      }
      return res.status(500).json({ message: 'Failed to send push' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to send notification' });
  }
});

export default router;
