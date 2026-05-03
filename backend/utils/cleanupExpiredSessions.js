import EditSession from "../models/EditSession.js";

export const cleanupExpiredSessions = async (userId) => {
  const now = new Date();
  
  // Heartbeat is sent every 30 seconds from frontend.
  // We allow 2 minutes of inactivity before clearing the session automatically.
  const inactivityThreshold = new Date(now.getTime() - 2 * 60 * 1000);

  const query = {
    userId,
    $or: [
      { expiresAt: { $lte: now } },
      { lastActivity: { $lte: inactivityThreshold } }
    ]
  };

  await EditSession.deleteMany(query);
};
