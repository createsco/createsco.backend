const express = require("express")
const admin = require("firebase-admin")
const User = require("../models/User")
const Admin = require("../models/Admin")
const { verifyFirebaseToken } = require("../middleware/firebaseAuth")
const { sanitizeInput } = require("../middleware/security")

const router = express.Router()

// Apply middleware
router.use(sanitizeInput)

// Check if any super admin exists
router.get("/check-setup", async (req, res) => {
  try {
    const superAdminExists = await Admin.findOne({ role: "super_admin" })

    res.json({
      success: true,
      data: {
        setupRequired: !superAdminExists,
        hasSuperAdmin: !!superAdminExists,
      },
    })
  } catch (error) {
    console.error("Check setup error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to check system status",
    })
  }
})

// Create first super admin (only if no super admin exists AND user has special setup key)
router.post("/create-super-admin", verifyFirebaseToken, async (req, res) => {
  const session = await User.startSession()

  try {
    await session.withTransaction(async () => {
      // Check if super admin already exists
      const existingSuperAdmin = await Admin.findOne({ role: "super_admin" }).session(session)

      if (existingSuperAdmin) {
        throw new Error("Super admin already exists")
      }

      // Verify setup key for initial super admin creation
      const { setupKey } = req.body
      const expectedSetupKey = process.env.SUPER_ADMIN_SETUP_KEY

      if (!expectedSetupKey) {
        throw new Error("Super admin setup is disabled")
      }

      if (!setupKey || setupKey !== expectedSetupKey) {
        throw new Error("Invalid setup key")
      }

      // Additional security: Check if this is one of the allowed initial admin emails
      const allowedAdminEmails = process.env.ALLOWED_ADMIN_EMAILS?.split(",").map((email) => email.trim()) || []

      // Get Firebase user details
      const firebaseUser = await admin.auth().getUser(req.user.firebaseUid)

      if (!firebaseUser) {
        throw new Error("Firebase user not found")
      }

      console.log("Firebase user details:", {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
      })

      // Verify user email is in allowed list (if configured)
      if (allowedAdminEmails.length > 0 && !allowedAdminEmails.includes(firebaseUser.email)) {
        throw new Error("Email not authorized for admin creation")
      }

      // Check if user exists in our database, if not create them
      let user = await User.findOne({ firebaseUid: req.user.firebaseUid }).session(session)

      if (!user) {
        // Create user in our database from Firebase user data
        const userData = {
          firebaseUid: firebaseUser.uid,
          username: firebaseUser.email.split("@")[0], // Use email prefix as username
          email: firebaseUser.email,
          phone: {
            countryCode: "+1", // Default country code
            number: "0000000000", // Default phone number - admin can update later
          },
          address: "Admin Address - Please Update", // Default address - admin can update later
          userType: "admin",
          emailVerified: firebaseUser.emailVerified,
          lastLoginAt: new Date(),
        }

        user = new User(userData)
        await user.save({ session })
        console.log("Created new user in database:", user._id)
      } else {
        // Update existing user type to admin
        user.userType = "admin"
        await user.save({ session })
        console.log("Updated existing user to admin:", user._id)
      }

      // Create admin record with super admin role
      const adminData = {
        userId: user._id,
        role: "super_admin",
        permissions: {
          managePartners: true,
          manageUsers: true,
          manageContent: true,
          viewAnalytics: true,
          systemSettings: true,
        },
        isActive: true,
      }

      const adminRecord = new Admin(adminData)
      await adminRecord.save({ session })
      console.log("Created admin record:", adminRecord._id)

      // Update Firebase custom claims with all necessary claims
      const customClaims = {
        userType: "admin",
        role: "super_admin",
        admin: true, // This is what your frontend is checking for
        verified: true,
        permissions: {
          managePartners: true,
          manageUsers: true,
          manageContent: true,
          viewAnalytics: true,
          systemSettings: true,
        },
      }

      console.log("Setting Firebase custom claims:", customClaims)
      await admin.auth().setCustomUserClaims(user.firebaseUid, customClaims)

      // Verify the claims were set correctly
      const updatedUser = await admin.auth().getUser(user.firebaseUid)
      console.log("Updated Firebase user custom claims:", updatedUser.customClaims)

      res.status(201).json({
        success: true,
        message: "Super admin created successfully",
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            userType: user.userType,
            firebaseUid: user.firebaseUid,
          },
          admin: adminRecord,
          firebaseClaims: customClaims,
        },
      })
    })
  } catch (error) {
    console.error("Create super admin error:", error)

    let message = "Failed to create super admin"
    let statusCode = 400

    if (error.message === "Super admin already exists") {
      message = "Super admin already exists in the system"
    } else if (error.message === "Firebase user not found") {
      message = "Firebase user account not found"
    } else if (error.message === "Invalid setup key") {
      message = "Invalid or missing setup key"
      statusCode = 401
    } else if (error.message === "Super admin setup is disabled") {
      message = "Super admin setup is not configured"
      statusCode = 403
    } else if (error.message === "Email not authorized for admin creation") {
      message = "Your email is not authorized for admin creation"
      statusCode = 403
    }

    res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  } finally {
    await session.endSession()
  }
})

// Create additional admin users (super admin only)
router.post("/create-admin", verifyFirebaseToken, async (req, res) => {
  const session = await User.startSession()

  try {
    await session.withTransaction(async () => {
      // Verify requester is super admin
      const requesterAdmin = await Admin.findOne({
        userId: req.user.id,
        role: "super_admin",
        isActive: true,
      }).session(session)

      if (!requesterAdmin) {
        throw new Error("Super admin access required")
      }

      const { userId, role = "admin", permissions = {} } = req.body

      if (!userId) {
        throw new Error("User ID is required")
      }

      // Check if user exists and is not already an admin
      const targetUser = await User.findById(userId).session(session)

      if (!targetUser) {
        throw new Error("Target user not found")
      }

      if (targetUser.userType === "admin") {
        throw new Error("User is already an admin")
      }

      // Check if admin record already exists
      const existingAdmin = await Admin.findOne({ userId }).session(session)

      if (existingAdmin) {
        throw new Error("Admin record already exists for this user")
      }

      // Update user type
      targetUser.userType = "admin"
      await targetUser.save({ session })

      // Default permissions based on role
      const defaultPermissions = {
        admin: {
          managePartners: true,
          manageUsers: false,
          manageContent: false,
          viewAnalytics: true,
          systemSettings: false,
        },
        moderator: {
          managePartners: true,
          manageUsers: false,
          manageContent: true,
          viewAnalytics: true,
          systemSettings: false,
        },
      }

      const finalPermissions = {
        ...defaultPermissions[role],
        ...permissions,
      }

      // Create admin record
      const adminData = {
        userId: targetUser._id,
        role: role,
        permissions: finalPermissions,
        isActive: true,
      }

      const adminRecord = new Admin(adminData)
      await adminRecord.save({ session })

      // Update Firebase custom claims
      const customClaims = {
        userType: "admin",
        role: role,
        admin: true, // This is what your frontend is checking for
        verified: true,
        permissions: finalPermissions,
      }

      await admin.auth().setCustomUserClaims(targetUser.firebaseUid, customClaims)

      res.status(201).json({
        success: true,
        message: `${role} created successfully`,
        data: {
          user: {
            id: targetUser._id,
            username: targetUser.username,
            email: targetUser.email,
            userType: targetUser.userType,
          },
          admin: adminRecord,
          firebaseClaims: customClaims,
        },
      })
    })
  } catch (error) {
    console.error("Create admin error:", error)

    res.status(400).json({
      success: false,
      message: error.message || "Failed to create admin",
    })
  } finally {
    await session.endSession()
  }
})

// Get all admin users (super admin only)
router.get("/admins", verifyFirebaseToken, async (req, res) => {
  try {
    // Verify requester is super admin
    const requesterAdmin = await Admin.findOne({
      userId: req.user.id,
      role: "super_admin",
      isActive: true,
    })

    if (!requesterAdmin) {
      return res.status(403).json({
        success: false,
        message: "Super admin access required",
      })
    }

    const admins = await Admin.find({ isActive: true })
      .populate("userId", "username email profilePic createdAt lastLoginAt")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: { admins },
    })
  } catch (error) {
    console.error("Get admins error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin users",
    })
  }
})

// Update admin permissions (super admin only)
router.patch("/admins/:adminId/permissions", verifyFirebaseToken, async (req, res) => {
  try {
    // Verify requester is super admin
    const requesterAdmin = await Admin.findOne({
      userId: req.user.id,
      role: "super_admin",
      isActive: true,
    })

    if (!requesterAdmin) {
      return res.status(403).json({
        success: false,
        message: "Super admin access required",
      })
    }

    const { permissions, role } = req.body

    const adminToUpdate = await Admin.findById(req.params.adminId).populate("userId")

    if (!adminToUpdate) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      })
    }

    // Prevent modifying super admin
    if (adminToUpdate.role === "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Cannot modify super admin permissions",
      })
    }

    // Update permissions and role
    if (permissions) {
      adminToUpdate.permissions = { ...adminToUpdate.permissions, ...permissions }
    }

    if (role && role !== "super_admin") {
      adminToUpdate.role = role
    }

    await adminToUpdate.save()

    // Update Firebase custom claims
    const customClaims = {
      userType: "admin",
      role: adminToUpdate.role,
      admin: true,
      verified: true,
      permissions: adminToUpdate.permissions,
    }

    await admin.auth().setCustomUserClaims(adminToUpdate.userId.firebaseUid, customClaims)

    res.json({
      success: true,
      message: "Admin permissions updated successfully",
      data: { admin: adminToUpdate },
    })
  } catch (error) {
    console.error("Update admin permissions error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update admin permissions",
    })
  }
})

// Deactivate admin (super admin only)
router.patch("/admins/:adminId/deactivate", verifyFirebaseToken, async (req, res) => {
  const session = await User.startSession()

  try {
    await session.withTransaction(async () => {
      // Verify requester is super admin
      const requesterAdmin = await Admin.findOne({
        userId: req.user.id,
        role: "super_admin",
        isActive: true,
      }).session(session)

      if (!requesterAdmin) {
        throw new Error("Super admin access required")
      }

      const adminToDeactivate = await Admin.findById(req.params.adminId).populate("userId").session(session)

      if (!adminToDeactivate) {
        throw new Error("Admin not found")
      }

      // Prevent deactivating super admin
      if (adminToDeactivate.role === "super_admin") {
        throw new Error("Cannot deactivate super admin")
      }

      // Prevent self-deactivation
      if (adminToDeactivate.userId._id.toString() === req.user.id) {
        throw new Error("Cannot deactivate your own account")
      }

      // Deactivate admin
      adminToDeactivate.isActive = false
      await adminToDeactivate.save({ session })

      // Update user type back to their original type or client
      const user = adminToDeactivate.userId
      user.userType = "client" // or determine original type
      await user.save({ session })

      // Remove Firebase custom claims
      await admin.auth().setCustomUserClaims(user.firebaseUid, {
        userType: "client",
        verified: user.emailVerified,
        admin: false, // Explicitly set to false
      })

      res.json({
        success: true,
        message: "Admin deactivated successfully",
      })
    })
  } catch (error) {
    console.error("Deactivate admin error:", error)
    res.status(400).json({
      success: false,
      message: error.message || "Failed to deactivate admin",
    })
  } finally {
    await session.endSession()
  }
})

// Endpoint to refresh Firebase claims for current user (useful for testing)
router.post("/refresh-claims", verifyFirebaseToken, async (req, res) => {
  try {
    // Get current user's admin record
    const adminRecord = await Admin.findOne({ userId: req.user.id, isActive: true })

    if (!adminRecord) {
      return res.status(404).json({
        success: false,
        message: "Admin record not found",
      })
    }

    // Update Firebase custom claims
    const customClaims = {
      userType: "admin",
      role: adminRecord.role,
      admin: true,
      verified: true,
      permissions: adminRecord.permissions,
    }

    await admin.auth().setCustomUserClaims(req.user.firebaseUid, customClaims)

    // Verify the claims were set
    const updatedUser = await admin.auth().getUser(req.user.firebaseUid)

    res.json({
      success: true,
      message: "Firebase claims refreshed successfully",
      data: {
        claims: updatedUser.customClaims,
      },
    })
  } catch (error) {
    console.error("Refresh claims error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to refresh claims",
    })
  }
})

module.exports = router
