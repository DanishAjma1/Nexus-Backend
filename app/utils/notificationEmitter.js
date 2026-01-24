let IO_INSTANCE = null;
let REDIS_CLIENT = null;

// Initialize with IO and Redis client from socketListeners
export const initNotificationEmitter = (io, redisClient) => {
  IO_INSTANCE = io;
  REDIS_CLIENT = redisClient;
};

// Emit notification to a specific user in real-time
export const emitNotification = async (notification) => {
  try {
    if (!IO_INSTANCE || !REDIS_CLIENT) {
      console.warn("Socket.IO not initialized yet, notification not emitted in real-time");
      return;
    }

    const recipientId = notification.recipient.toString();
    
    // Get the socket ID from Redis
    const socketId = await REDIS_CLIENT.get(`user:${recipientId}`);
    
    if (socketId) {
      // User is online, emit the notification
      IO_INSTANCE.to(socketId).emit("new-notification", {
        _id: notification._id,
        recipient: notification.recipient,
        sender: notification.sender,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        link: notification.link,
        createdAt: notification.createdAt,
      });
      console.log(`✅ Real-time notification sent to user ${recipientId}`);
    } else {
      console.log(`ℹ️ User ${recipientId} is offline, notification saved in DB only`);
    }
  } catch (error) {
    console.error("Error emitting notification:", error);
  }
};

// Emit notification to multiple users (for bulk notifications)
export const emitNotifications = async (notifications) => {
  for (const notification of notifications) {
    await emitNotification(notification);
  }
};
