import User from "../models/User.js";
import EditSession from "../models/EditSession.js";
import bcrypt from 'bcrypt';


// ✅ Helper function to cleanup expired sessions
const cleanupExpiredSessions = async (userId = null) => {
  try {
    const now = new Date();
    // Heartbeat is sent every 30 seconds from frontend.
    // We allow 2 minutes of inactivity before clearing the session automatically.
    const inactivityThreshold = new Date(now.getTime() - 2 * 60 * 1000);

    const query = {
      $or: [
        { expiresAt: { $lt: now } },
        { 
          lastActivity: { $lt: inactivityThreshold },
          status: 'active'
        }
      ]
    };
    
    if (userId) {
      query.userId = userId;
    }
    
    const result = await EditSession.deleteMany(query);
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} expired edit sessions`);
    }
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
  }
};

// ============= GET ALL USERS =============
export const getAllUsers = async (req, res) => {
  try {
    await cleanupExpiredSessions(); // Cleanup all expired sessions first

    // Fetch users from database with lock status
    const users = await User.find({})
      .select("_id firstName lastName email role updatedAt isActive isArchived lockedByAdmin lockedByAdminAt lockReason lockExpiresAt lockedByAdminName")
      .sort({ updatedAt: -1 });
    
    // Ensure isArchived is present even if not in DB (for older records)
    const normalizedUsers = users.map(user => {
      const userObj = user.toObject();
      return {
        ...userObj,
        isArchived: userObj.isArchived || false
      };
    });
    
    res.json(normalizedUsers);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ 
      message: "Error fetching users",
      error: error.message 
    });
  }
};

// ============= ADMIN LOCK ACCOUNT =============
export const lockUserAccount = async (req, res) => {
  try {
    const { adminId, adminName, reason, duration } = req.body;
    const userId = req.params.id;

    // Validate required fields
    if (!adminId || !adminName) {
      return res.status(400).json({ 
        success: false,
        message: "Admin ID and name are required" 
      });
    }

    // Find the user to lock (explicitly select password to satisfy required validation on save)
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Prevent locking yourself
    if (user._id.toString() === adminId) {
      return res.status(400).json({ 
        success: false,
        message: "You cannot lock your own account" 
      });
    }

    // Prevent locking other admins (optional security measure)
    if (user.role === 'admin') {
      return res.status(403).json({ 
        success: false,
        message: "Cannot lock another admin account. Please demote to user first." 
      });
    }

    // Lock the account (this method handles history internally)
    user.lockAccount(adminId, adminName, reason || 'Locked by administrator', duration);
    await user.save();

    console.log(`🔒 Account locked: ${user.email} by ${adminName}${duration ? ` for ${duration} minutes` : ' permanently'}`);

    res.json({ 
      success: true,
      message: `Account locked successfully${duration ? ` for ${duration} minutes` : ' until manually unlocked'}`,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        lockedByAdmin: user.lockedByAdmin,
        lockedByAdminAt: user.lockedByAdminAt,
        lockedByAdminName: user.lockedByAdminName,
        lockReason: user.lockReason,
        lockExpiresAt: user.lockExpiresAt,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error("❌ Error locking account:", error);
    res.status(500).json({ 
      success: false,
      message: "Error locking account",
      error: error.message 
    });
  }
};

// ============= ADMIN UNLOCK ACCOUNT =============
export const unlockUserAccount = async (req, res) => {
  try {
    const { adminId, adminName, reason } = req.body;
    const userId = req.params.id;

    // Validate required fields
    if (!adminId || !adminName) {
      return res.status(400).json({ 
        success: false,
        message: "Admin ID and name are required" 
      });
    }

    // Find the user to unlock (explicitly select password to satisfy required validation on save)
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Prevent unlocking yourself
    if (user._id.toString() === adminId) {
      return res.status(400).json({ 
        success: false,
        message: "You cannot unlock your own account" 
      });
    }

    // Check if account is actually locked
    if (!user.lockedByAdmin && !user.accountLockedUntil) {
      return res.status(400).json({ 
        success: false,
        message: "Account is not locked" 
      });
    }

    // Unlock the account (this method handles history internally)
    user.unlockAccount(adminId, adminName, reason || 'Unlocked by administrator');
    await user.save();

    console.log(`🔓 Account unlocked: ${user.email} by ${adminName}`);

    res.json({ 
      success: true,
      message: "Account unlocked successfully",
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        lockedByAdmin: user.lockedByAdmin,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error("❌ Error unlocking account:", error);
    res.status(500).json({ 
      success: false,
      message: "Error unlocking account",
      error: error.message 
    });
  }
};

// ============= GET LOCK HISTORY =============
export const getUserLockHistory = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .select("lockHistory firstName lastName email");
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    res.json({ 
      success: true,
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      },
      lockHistory: user.lockHistory || []
    });

  } catch (error) {
    console.error("❌ Error fetching lock history:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching lock history",
      error: error.message 
    });
  }
};

// ============= GET LOCK STATUS =============
export const getUserLockStatus = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .select("lockedByAdmin lockedByAdminAt lockedByAdminName lockReason lockExpiresAt isActive accountLockedUntil failedLoginAttempts");
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Check if admin lock has expired
    let isLocked = user.lockedByAdmin;
    if (user.lockExpiresAt && user.lockExpiresAt < new Date()) {
      isLocked = false;
    }

    // Check if auto-lock has expired
    let isAutoLocked = false;
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      isAutoLocked = true;
    }

    res.json({ 
      success: true,
      lockStatus: {
        isLockedByAdmin: isLocked,
        isAutoLocked: isAutoLocked,
        lockedByAdminAt: user.lockedByAdminAt,
        lockedByAdminName: user.lockedByAdminName,
        lockReason: user.lockReason,
        lockExpiresAt: user.lockExpiresAt,
        accountLockedUntil: user.accountLockedUntil,
        failedLoginAttempts: user.failedLoginAttempts,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error("❌ Error fetching lock status:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching lock status",
      error: error.message 
    });
  }
};

// In userController.js
export const createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;
    
    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ 
        message: "All fields are required" 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ 
        message: "User with this email already exists" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: role || 'user',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newUser.save();

    // Remove password from response
    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: "User created successfully",
      user: userResponse
    });

  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ 
      message: "Failed to create user",
      error: error.message 
    });
  }
};

// ============= UPDATE USER ROUTE WITH EXPIRATION CHECK =============
export const updateUser = async (req, res) => {
  try {
    const { firstName, lastName, email, role, lastUpdatedAt, adminId } = req.body;
    const userId = req.params.id;

    await cleanupExpiredSessions(userId);
    
    const session = await EditSession.findOne({ 
      userId, 
      status: 'active' 
    });
    
    if (session) {
      if (session.isActive() && session.adminId.toString() !== adminId) {
        const timeLeft = Math.round((session.expiresAt - new Date()) / 60000);
        return res.status(403).json({
          message: `Save rejected: ${session.adminName} is editing this user (session expires in ${timeLeft} minutes).`,
          code: "NO_PRIORITY"
        });
      } else if (!session.isActive()) {
        await EditSession.deleteOne({ _id: session._id });
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (lastUpdatedAt) {
      const currentUpdatedAt = new Date(user.updatedAt).toISOString();
      const clientUpdatedAt = new Date(lastUpdatedAt).toISOString();

      if (currentUpdatedAt !== clientUpdatedAt) {
        return res.status(409).json({
          message: "This user was updated by another admin. Please refresh and try again.",
          code: "TIMESTAMP_CONFLICT"
        });
      }
    }

    // Use findByIdAndUpdate to avoid validation issues with fields like password
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          firstName, 
          lastName, 
          email, 
          role,
          updatedAt: new Date()
        } 
      },
      { new: true, runValidators: false }
    );

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    await EditSession.deleteOne({ userId, adminId });

    return res.json({
      success: true,
      user: {
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        role: updatedUser.role,
        updatedAt: updatedUser.updatedAt,
        lockedByAdmin: updatedUser.lockedByAdmin,
        isActive: updatedUser.isActive
      }
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ============= ARCHIVE USER =============
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
       return res.status(400).json({ message: "Invalid user ID format" });
     }
 
    // Prevent archiving self
    if (id === req.user?._id?.toString()) {
      return res.status(400).json({ message: "You cannot archive your own account" });
    }

    // Use findByIdAndUpdate to avoid validation issues with fields like password
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { 
        $set: { 
          isArchived: true, 
          isActive: false 
        } 
      },
      { new: true, runValidators: false } // Skip full validation for archiving
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    console.log(`📁 User archived: ${updatedUser.email}`);
    
    res.json({ message: "User archived successfully" });
  } catch (err) {
    console.error("❌ Error archiving user:", err);
    res.status(500).json({ message: err.message || "Server error while archiving user" });
  }
};

// ============= UNARCHIVE USER =============
export const unarchiveUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    // Use findByIdAndUpdate to avoid validation issues
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { 
        $set: { 
          isArchived: false, 
          isActive: true 
        } 
      },
      { new: true, runValidators: false }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    console.log(`♻️ User restored: ${updatedUser.email}`);
    
    res.json({ message: "User unarchived successfully", user: updatedUser });
  } catch (err) {
    console.error("❌ Error unarchiving user:", err);
    res.status(500).json({ message: err.message || "Server error while restoring user" });
  }
};

// ============= CHANGE USER ROLE =============
export const changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    user.role = role;
    await user.save();

    res.json({ 
      message: `Role updated to ${role}`,
      user: user
    });

  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ 
      message: "Error updating role",
      error: error.message 
    });
  }
};

// ============= SEARCH USERS ============
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const users = await User.find({
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    })
    .select("_id firstName lastName email role")
    .limit(10);

    res.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ 
      message: "Error searching users",
      error: error.message 
    });
  }
};
