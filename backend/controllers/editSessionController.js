import EditSession from "../models/EditSession.js";
import { cleanupExpiredSessions } from "../utils/cleanupExpiredSessions.js";


// ✅ Start edit session with expiration
export const startEditSession = async (req, res) => {
  try {
    const { adminId, adminName } = req.body;
    const userId = req.params.id;

    await cleanupExpiredSessions(userId);

    const existingSession = await EditSession.findOne({ 
      userId, 
      status: 'active'
    });

    if (existingSession && existingSession.isActive()) {
      const timeLeft = Math.round((existingSession.expiresAt - new Date()) / 60000);
      
      return res.json({
        success: true,
        hasPriority: existingSession.adminId.toString() === adminId,
        firstEditor: {
          adminId: existingSession.adminId,
          adminName: existingSession.adminName,
          lastActivity: existingSession.lastActivity,
          expiresAt: existingSession.expiresAt,
          timeLeft: `${timeLeft} minutes`
        }
      });
    }

    if (existingSession) {
      await EditSession.deleteOne({ _id: existingSession._id });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    const session = await EditSession.create({
      userId,
      adminId,
      adminName,
      lastActivity: new Date(),
      expiresAt,
      status: 'active'
    });

    const timeLeft = Math.round((session.expiresAt - new Date()) / 60000);

    return res.json({
      success: true,
      hasPriority: true,
      firstEditor: {
        adminId,
        adminName,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        timeLeft: `${timeLeft} minutes`
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

// ✅ Heartbeat endpoint to keep session alive
export const heartbeatEditSession = async (req, res) => {
  try {
    const { adminId } = req.body;
    const userId = req.params.id;

    await cleanupExpiredSessions(userId);

    const session = await EditSession.findOne({ 
      userId, 
      adminId, 
      status: 'active' 
    });
    
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found or expired',
        code: 'SESSION_EXPIRED'
      });
    }

    if (!session.isActive()) {
      await EditSession.deleteOne({ _id: session._id });
      return res.status(410).json({ 
        error: 'Session expired due to inactivity',
        code: 'SESSION_EXPIRED'
      });
    }

    session.lastActivity = new Date();
    session.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await session.save();

    const timeLeft = Math.round((session.expiresAt - new Date()) / 60000);

    return res.json({ 
      success: true,
      expiresAt: session.expiresAt,
      timeLeft: timeLeft
    });

  } catch (error) {
    console.error("Error updating heartbeat:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ Check session status
export const checkEditSessionStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { adminId } = req.query; // Get adminId from query params

    await cleanupExpiredSessions(userId);

    const session = await EditSession.findOne({ 
      userId, 
      status: 'active' 
    });
    
    if (!session) {
      return res.json({ 
        hasActiveSession: false,
        canClaimPriority: true,
        message: "No active edit session"
      });
    }

    const isActive = session.isActive();

    if (!isActive) {
      await EditSession.deleteOne({ _id: session._id });
      return res.json({ 
        hasActiveSession: false,
        canClaimPriority: true,
        message: "Edit session expired"
      });
    }

    const timeLeft = Math.round((session.expiresAt - new Date()) / 60000);

    return res.json({
      hasActiveSession: true,
      hasPriority: session.adminId.toString() === adminId,
      canClaimPriority: false,
      firstEditor: {
        adminId: session.adminId,
        adminName: session.adminName,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        timeLeft: timeLeft
      },
      expiresAt: session.expiresAt
    });

  } catch (error) {
    console.error("Error checking edit status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ End edit session
export const endEditSession = async (req, res) => {
  try {
    const { adminId } = req.body;
    const userId = req.params.id;

    const result = await EditSession.deleteOne({ 
      userId, 
      adminId 
    });
    
    return res.json({ 
      success: true,
      deleted: result.deletedCount > 0
    });

  } catch (error) {
    console.error("Error ending edit session:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ✅ Force release edit session (for any admin)
export const forceReleaseSession = async (req, res) => {
  try {
    const userId = req.params.id;
    const { adminId, adminName } = req.body;

    // Delete any active session for this user
    await EditSession.deleteMany({ userId });
    
    // Optional: Log who forced the release
    console.log(`Admin ${adminName} (${adminId}) forced release of edit session for user ${userId}`);

    return res.json({ 
      success: true,
      message: "Edit session force released successfully."
    });
  } catch (error) {
    console.error("Error force releasing session:", error);
    return res.status(500).json({ message: error.message });
  }
};
