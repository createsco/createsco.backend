const express = require("express")
const multer = require("multer")
const Partner = require("../models/Partner")
const User = require("../models/User")
const { verifyFirebaseToken, authorize, requireEmailVerification } = require("../middleware/firebaseAuth")
const { validatePartnerProfile, validateService } = require("../middleware/validation")
const { sanitizeInput } = require("../middleware/security")

const router = express.Router()

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Only image and PDF files are allowed"), false)
    }
  },
})

// Apply middleware
router.use(sanitizeInput)
router.use(verifyFirebaseToken)
router.use(authorize("partner", "admin"))

// Get partner profile
router.get("/me", async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id }).populate("userId", "username email profilePic")

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      })
    }

    res.json({
      success: true,
      data: { partner },
    })
  } catch (error) {
    console.error("Get partner profile error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch partner profile",
    })
  }
})

// Update partner profile
router.patch("/me", validatePartnerProfile, async (req, res) => {
  try {
    const partner = await Partner.findOneAndUpdate({ userId: req.user.id }, req.body, {
      new: true,
      runValidators: true,
    }).populate("userId", "username email profilePic")

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      })
    }

    res.json({
      success: true,
      message: "Partner profile updated successfully",
      data: { partner },
    })
  } catch (error) {
    console.error("Update partner profile error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update partner profile",
    })
  }
})

// Add service
router.post("/services", validateService, requireEmailVerification, async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id })

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      })
    }

    await partner.addService(req.body)

    res.status(201).json({
      success: true,
      message: "Service added successfully",
      data: { partner },
    })
  } catch (error) {
    console.error("Add service error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to add service",
    })
  }
})

// Update service
router.patch("/services/:serviceId", validateService, requireEmailVerification, async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id })

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      })
    }

    const service = partner.services.id(req.params.serviceId)
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      })
    }

    Object.assign(service, req.body)
    await partner.save()

    res.json({
      success: true,
      message: "Service updated successfully",
      data: { partner },
    })
  } catch (error) {
    console.error("Update service error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update service",
    })
  }
})

// Delete service
router.delete("/services/:serviceId", requireEmailVerification, async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id })

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      })
    }

    await partner.removeService(req.params.serviceId)

    res.json({
      success: true,
      message: "Service deleted successfully",
      data: { partner },
    })
  } catch (error) {
    console.error("Delete service error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to delete service",
    })
  }
})

// Upload documents
router.post("/documents", upload.array("documents", 5), requireEmailVerification, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No documents provided",
      })
    }

    const partner = await Partner.findOne({ userId: req.user.id })

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      })
    }

    // Process uploaded documents
    const documents = req.files.map((file) => ({
      docName: file.originalname,
      fileUrl: `${process.env.BASE_URL}/uploads/documents/${req.user.id}-${Date.now()}-${file.originalname}`,
      status: "pending",
    }))

    partner.documents.push(...documents)
    await partner.save()

    res.json({
      success: true,
      message: "Documents uploaded successfully",
      data: { documents },
    })
  } catch (error) {
    console.error("Upload documents error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to upload documents",
    })
  }
})

// Get all verified partners (public endpoint)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      location,
      specialization,
      minRating,
      sortBy = "avgRating",
      sortOrder = "desc",
    } = req.query

    const query = { verified: true, deletedAt: null }

    // Add filters
    if (location) {
      query.servingLocations = { $in: [location] }
    }

    if (specialization) {
      query.specializations = { $in: [specialization] }
    }

    if (minRating) {
      query.avgRating = { $gte: Number.parseFloat(minRating) }
    }

    // Build sort object
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    const partners = await Partner.find(query)
      .populate("userId", "username profilePic")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select("-documents -dashboardData")

    const total = await Partner.countDocuments(query)

    res.json({
      success: true,
      data: {
        partners,
        pagination: {
          page: Number.parseInt(page),
          limit: Number.parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error("Get partners error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch partners",
    })
  }
})

// Get single partner profile (public)
router.get("/:id", async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id)
      .populate("userId", "username profilePic createdAt")
      .select("-documents -dashboardData")
      .where("verified")
      .equals(true)
      .where("deletedAt")
      .equals(null)

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      })
    }

    res.json({
      success: true,
      data: { partner },
    })
  } catch (error) {
    console.error("Get partner error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch partner",
    })
  }
})

module.exports = router
