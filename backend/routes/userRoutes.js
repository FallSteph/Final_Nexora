import express from "express";
import { getAllUsers, lockUserAccount, unlockUserAccount, getUserLockHistory, getUserLockStatus, createUser,updateUser, deleteUser, unarchiveUser, changeUserRole, searchUsers } from "../controllers/userController.js";
import { changePassword, addPassword } from "../controllers/passwordController.js";
import { startEditSession, heartbeatEditSession, checkEditSessionStatus, endEditSession, forceReleaseSession } from "../controllers/editSessionController.js"
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// ============= GET ALL USERS =============
router.get('/', authMiddleware, getAllUsers);

// ============= PASSWORD MANAGEMENT =============
router.put('/change-password', authMiddleware, changePassword);
router.post('/add-password', authMiddleware, addPassword);

// ============= ADMIN LOCK ACCOUNT =============
router.post('/:id/lock', authMiddleware, lockUserAccount);

// ============= ADMIN UNLOCK ACCOUNT =============
router.post('/:id/unlock', authMiddleware, unlockUserAccount);

// ============= GET LOCK HISTORY =============
router.get('/:id/lock-history', authMiddleware, getUserLockHistory);

// ============= GET LOCK STATUS =============
router.get('/:id/lock-status', authMiddleware, getUserLockStatus);

// ✅ Start edit session with expiration
router.post('/:id/start-edit', authMiddleware, startEditSession);

// ✅ Heartbeat endpoint to keep session alive
router.post('/:id/heartbeat', authMiddleware, heartbeatEditSession);

// ✅ Check session status
router.get('/:id/edit-status', authMiddleware, checkEditSessionStatus);

// ✅ End edit session
router.delete('/:id/end-edit', authMiddleware, endEditSession);

// ✅ Force release edit session
router.post('/:id/force-release', authMiddleware, forceReleaseSession);

// ============= CREATE NEW USER ============= ✅ ADD THIS ROUTE
router.post('/', authMiddleware, createUser);

// ============= UPDATE USER ROUTE WITH EXPIRATION CHECK =============
router.put('/:id', authMiddleware, updateUser);

// ============= DELETE USER =============
router.delete('/:id', authMiddleware, deleteUser);

// ============= UNARCHIVE USER =============
router.post('/:id/unarchive', authMiddleware, unarchiveUser);

// ============= CHANGE USER ROLE =============
router.put('/:id/role', authMiddleware, changeUserRole);

// ============= SEARCH USERS =============
router.get('/search', authMiddleware, searchUsers);



export default router;
