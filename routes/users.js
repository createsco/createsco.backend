const express = require("express")
const multer = require("multer")
const sharp = require("sharp")
const User = require("../models/User")
const { verifyFirebaseToken, authorize, requireEmailVerification } = require("../middleware/firebaseAuth")
const { sanitizeInput } = require("../middleware/security")

const router = express.Router()

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed"), false)
    }
  },
})

// Apply middleware
router.use(sanitizeInput)
router.use(verifyFirebaseToken)

// Get current user profile
router.get("/me", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-__v")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      data: { user },
    })
  } catch (error) {
    console.error("Get user profile error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
    })
  }
})

// Update user profile
router.patch("/me", async (req, res) => {
  try {
    const allowedFields = ["username", "phone", "address", "notificationPreferences"]

    // Filter allowed fields
    const updates = {}
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key]
      }
    })

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      })
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-__v")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: { user },
    })
  } catch (error) {
    console.error("Update user profile error:", error)

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      })
    }

    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    })
  }
})

// Upload profile picture
router.post("/upload-avatar", upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      })
    }

    // Process image with Sharp
    const processedImageBuffer = await sharp(req.file.buffer)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 90 })
      .toBuffer()

    // In a real application, you would upload this to a cloud storage service
    // For now, we'll just simulate a URL
    const imageUrl = `${process.env.BASE_URL}/uploads/avatars/${req.user.id}-${Date.now()}.jpg`

    // Update user profile picture
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePic: imageUrl },
      { new: true, runValidators: true },
    ).select("-__v")

    res.json({
      success: true,
      message: "Profile picture uploaded successfully",
      data: {
        user,
        imageUrl,
      },
    })
  } catch (error) {
    console.error("Upload avatar error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to upload profile picture",
    })
  }
})

// Get public user profile
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("username profilePic userType createdAt")
      .where("deletedAt")
      .equals(null)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      data: { user },
    })
  } catch (error) {
    console.error("Get public user profile error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
    })
  }
})

// Deactivate account (soft delete)
router.patch("/deactivate", requireEmailVerification, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    await user.softDelete()

    res.json({
      success: true,
      message: "Account deactivated successfully",
    })
  } catch (error) {
    console.error("Deactivate account error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to deactivate account",
    })
  }
})

module.exports = router
