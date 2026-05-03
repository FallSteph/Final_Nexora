import express from "express";
import { signup, login, googleLogin, verifyToken, updateProfile, getMe } from "../controllers/authController.js";
import {  getNotificationSettings,updateNotificationSettings, resetNotificationSettings } from "../controllers/notificationController.js";
import { trackAuthActivity } from "../middleware/activity.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// ---------------- SIGNUP ----------------
router.post("/signup", trackAuthActivity("signup_attempt"), signup);

// ----------------- LOGIN (with reCAPTCHA) -----------------
router.post("/login", trackAuthActivity("login_attempt"), login);

// ----------------- GOOGLE LOGIN -----------------
router.post("/google", googleLogin);

// ---------------- TOKEN VERIFICATION (FROM FILE 1) ----------------
router.get("/verify", verifyToken);

// ---------------- GET CURRENT USER (ME) ----------------
router.get("/me", authMiddleware, getMe);

// ---------------- UPDATE PROFILE ----------------
router.put("/profile", authMiddleware, trackAuthActivity("profile_update"), updateProfile);

// ✅ NEW: NOTIFICATION SETTINGS ROUTES ----------------
router.get("/notification-settings", authMiddleware, getNotificationSettings);
router.put("/notification-settings", authMiddleware, updateNotificationSettings);
router.post("/notification-settings/reset", authMiddleware, resetNotificationSettings);

export default router;