import bcrypt from "bcrypt"
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import sendEmail from "../utils/sendEmail.js";

// 🔹 Request Password Reset
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) {
      // For security, still return ok: true but log it for debug
      console.log(`Forgot password request for non-existent email: ${email}`);
      return res.json({ ok: true, message: "If the email exists, a reset code has been sent." });
    }

    if (user.authProvider === 'google') {
      return res.status(400).json({ 
        message: "This account is linked with Google. Please continue using Google login.",
        isGoogleUser: true
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate old codes
    await PasswordReset.updateMany({ email }, { used: true });
    await PasswordReset.create({ email, code, expiresAt });

    try {
      await sendEmail(
        email, 
        "Password Reset Code", 
        `Use this code to reset your password: ${code}`,
        `
          <h2>Password Reset Request</h2>
          <p>Use this code to reset your password:</p>
          <h1 style="background: #f4f4f4; padding: 10px; border-radius: 5px; display: inline-block;">${code}</h1>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      );
    } catch (emailErr) {
      console.error("Failed to send reset email:", emailErr);
      return res.status(500).json({ message: "Failed to send reset email. Please try again later." });
    }

    res.json({ ok: true, message: "If the email exists, a reset code has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error." });
  }
};

// 🔹 Verify code
export const verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Missing fields' });

    const record = await PasswordReset
      .findOne({ email, code, used: false })
      .sort({ createdAt: -1 });

    if (!record) return res.status(400).json({ error: 'Invalid code' });
    if (new Date() > record.expiresAt) return res.status(400).json({ error: 'Code expired' });

    res.json({ ok: true, message: 'Code verified' });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// 🔹 Reset password
export const resetPassword = async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) return res.status(400).json({ error: 'Missing fields' });

    // Strong password validation
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!passwordPattern.test(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long, include 1 uppercase, 1 lowercase, 1 number, and 1 special character.',
      });
    }

    const record = await PasswordReset
      .findOne({ email, code, used: false })
      .sort({ createdAt: -1 });

    if (!record) return res.status(400).json({ error: 'Invalid or used code' });
    if (new Date() > record.expiresAt) return res.status(400).json({ error: 'Code expired' });

    const user = await User.findOne({ email });
    if (user && user.authProvider === 'google') {
      return res.status(400).json({ 
        error: "This account is linked with Google. Please continue using Google login." 
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    await User.updateOne({ email }, { $set: { password: hashed } });

    record.used = true;
    await record.save();

    res.json({ ok: true, message: 'Password successfully reset' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// 🔹 Change Password (authenticated)
export const changePassword = async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Find user and include password field
    const user = await User.findById(userId).select("+password authProvider");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Security check: Must have a password to change it
    if (!user.password) {
      return res.status(400).json({ 
        message: "This account doesn't have a password set. Please use the 'Add Password' feature if available." 
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect current password. Please try again." });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Error changing password", error: error.message });
  }
};

// 🔹 Add Password (for Google users without one)
export const addPassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Find user and include password field
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Security check: Only add if password doesn't exist
    if (user.password) {
      return res.status(400).json({ 
        message: "This account already has a password. Use the 'Change Password' feature instead." 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();

    res.json({ success: true, message: "Password added successfully" });
  } catch (error) {
    console.error("Error adding password:", error);
    res.status(500).json({ message: "Error adding password", error: error.message });
  }
};
