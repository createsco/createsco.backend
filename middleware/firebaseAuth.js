const admin = require("firebase-admin");
const User = require("../models/User");

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided or invalid format",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify the Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // For admin setup, we might not have the user in database yet
    // So we'll attach Firebase user info and let the route handler deal with database user
    console.log(decodedToken);
    req.user = {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
    };

    // Try to get user from database (for existing users)
    const user = await User.findByFirebaseUid(decodedToken.uid);

    if (user) {
      // User exists in database, add database info
      req.user.id = user._id;
      req.user.userType = user.userType;

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: "Account is deactivated",
        });
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();
    }
    // If user doesn't exist in database, that's okay for admin setup
    // The route handler will create the user if needed

    next();
  } catch (error) {
    console.error("Firebase token verification error:", error);

    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        success: false,
        message: "Token has expired",
      });
    }

    if (error.code === "auth/id-token-revoked") {
      return res.status(401).json({
        success: false,
        message: "Token has been revoked",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!req.user.userType || !roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

const requireEmailVerification = (req, res, next) => {
  if (!req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      message: "Email verification required",
    });
  }
  next();
};

module.exports = {
  verifyFirebaseToken,
  authorize,
  requireEmailVerification,
};
