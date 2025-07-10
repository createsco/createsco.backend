const express = require("express");
const admin = require("firebase-admin");
const User = require("../models/User");
const Client = require("../models/Client");
const Partner = require("../models/Partner");
const { validateUserRegistration } = require("../middleware/validation");
const { verifyFirebaseToken } = require("../middleware/firebaseAuth");
const { deviceFingerprinting, sanitizeInput } = require("../middleware/security");
const { sendWelcomeEmail, sendLoginNotification } = require("../utils/emailService");

const router = express.Router();

// Apply middleware to all routes
router.use(sanitizeInput);
router.use(deviceFingerprinting);

// In-memory store for failed login attempts (in production, use MongoDB)
const failedAttempts = new Map();

// Clean up failed attempts every hour
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, data] of failedAttempts.entries()) {
      if (now - data.lastAttempt > 15 * 60 * 1000) {
        // 15 minutes
        failedAttempts.delete(ip);
      }
    }
  },
  60 * 60 * 1000,
); // 1 hour

// Register user in database after Firebase registration
router.post("/register", validateUserRegistration, async (req, res) => {
  const session = await User.startSession();

  try {
    await session.withTransaction(async () => {
      const { username, email, userType, phone, address, firebaseUid } = req.body;

      // Verify Firebase user exists
      const firebaseUser = await admin.auth().getUser(firebaseUid);

      if (!firebaseUser) {
        throw new Error("Firebase user not found");
      }

      // Check if user already exists in database
      const existingUser = await User.findOne({
        $or: [{ email }, { username }, { firebaseUid }],
      }).session(session);

      if (existingUser) {
        throw new Error("User with this email, username, or Firebase UID already exists");
      }

      // Create user in database
      const userData = {
        firebaseUid,
        username,
        email,
        phone,
        address,
        userType,
        emailVerified: firebaseUser.emailVerified,
        lastLoginAt: new Date(),
      };

      const user = new User(userData);
      await user.save({ session });

      // Create user type specific record
      if (userType === "client") {
        const client = new Client({ userId: user._id });
        await client.save({ session });
      } else if (userType === "partner") {
        const partner = new Partner({ userId: user._id });
        await partner.save({ session });
      }

      // Send welcome email
      await sendWelcomeEmail(email, username, userType);

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: {
            id: user._id,
            firebaseUid: user.firebaseUid,
            username: user.username,
            email: user.email,
            userType: user.userType,
            emailVerified: user.emailVerified,
          },
        },
      });
    });
  } catch (error) {
    console.error("Registration error:", error);

    let message = "Registration failed";
    if (error.message.includes("already exists")) {
      message = error.message;
    }

    res.status(400).json({
      success: false,
      message,
    });
  } finally {
    await session.endSession();
  }
});

// Login (verify token and update login info)
router.post("/login", verifyFirebaseToken, async (req, res) => {
  try {
    const clientIp = req.ip;

    // Check for too many failed attempts
    const attempts = failedAttempts.get(clientIp);
    if (attempts && attempts.count >= 5 && Date.now() - attempts.lastAttempt < 15 * 60 * 1000) {
      return res.status(429).json({
        success: false,
        message: "Too many failed login attempts. Please try again later.",
      });
    }

    const user = await User.findById(req.user.id).select("-__v");

    if (!user) {
      // Track failed attempt
      const current = failedAttempts.get(clientIp) || { count: 0, lastAttempt: 0 };
      failedAttempts.set(clientIp, {
        count: current.count + 1,
        lastAttempt: Date.now(),
      });

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Clear failed attempts on successful login
    failedAttempts.delete(clientIp);

    // Send login notification email (async)
    if (req.deviceInfo) {
      sendLoginNotification(user.email, user.username, req.deviceInfo).catch(console.error);
    }

    // Get user type specific data
    const additionalData = {};

    if (user.userType === "client") {
      const client = await Client.findOne({ userId: user._id }).populate("favouritePartners");
      if (client) {
        additionalData.favouritePartners = client.favouritePartners;
      }
    } else if (user.userType === "partner") {
      const partner = await Partner.findOne({ userId: user._id });
      if (partner) {
        additionalData.partnerProfile = partner;
      }
    }

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          ...user.toObject(),
          ...additionalData,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// Logout (revoke Firebase token)
router.post("/logout", verifyFirebaseToken, async (req, res) => {
  try {
    // Revoke Firebase refresh tokens
    await admin.auth().revokeRefreshTokens(req.user.firebaseUid);

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
});

// Delete user account
router.delete("/delete-account", verifyFirebaseToken, async (req, res) => {
  const session = await User.startSession();

  try {
    await session.withTransaction(async () => {
      // Soft delete user in database
      const user = await User.findById(req.user.id).session(session);
      if (user) {
        await user.softDelete();
      }

      // Delete Firebase user
      await admin.auth().deleteUser(req.user.firebaseUid);
    });

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete account",
    });
  } finally {
    await session.endSession();
  }
});

// Verify email (update database when Firebase email is verified)
router.post("/verify-email", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (req.user.emailVerified) {
      user.emailVerified = true;
      await user.save();

      res.json({
        success: true,
        message: "Email verified successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Email not verified in Firebase",
      });
    }
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({
      success: false,
      message: "Email verification failed",
    });
  }
});

// Get current user info
router.get("/me", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user data",
    });
  }
});

module.exports = router;
