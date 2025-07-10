const express = require("express")
const Lead = require("../models/Lead")
const User = require("../models/User")
const Partner = require("../models/Partner")
const { verifyFirebaseToken, authorize, requireEmailVerification } = require("../middleware/firebaseAuth")
const { sanitizeInput } = require("../middleware/security")
const Joi = require("joi")

const router = express.Router()

// Apply middleware
router.use(sanitizeInput)
router.use(verifyFirebaseToken)

// Validation schemas
const createLeadSchema = Joi.object({
  partnerId: Joi.string().required(),
  message: Joi.string().min(10).max(1000).required(),
  serviceType: Joi.string().optional(),
  eventDate: Joi.date().optional(),
  budget: Joi.object({
    min: Joi.number().min(0).optional(),
    max: Joi.number().min(0).optional(),
    currency: Joi.string().default("INR").optional(),
  }).optional(),
  location: Joi.string().optional(),
  contactMethod: Joi.string()
    .valid("email", "phone", "whatsapp", "website_form", "direct_message")
    .default("website_form"),
  source: Joi.string().valid("website", "social_media", "referral", "advertisement", "direct").default("website"),
})

const updateLeadSchema = Joi.object({
  status: Joi.string().valid("new", "contacted", "converted", "closed").optional(),
  message: Joi.string().min(10).max(1000).optional(),
  serviceType: Joi.string().optional(),
  eventDate: Joi.date().optional(),
  budget: Joi.object({
    min: Joi.number().min(0).optional(),
    max: Joi.number().min(0).optional(),
    currency: Joi.string().optional(),
  }).optional(),
  location: Joi.string().optional(),
  priority: Joi.string().valid("low", "medium", "high", "urgent").optional(),
})

// Create a new lead (clients only)
router.post("/", authorize("client"), async (req, res) => {
  try {
    const { error, value } = createLeadSchema.validate(req.body)
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        details: error.details[0].message,
      })
    }

    // Verify partner exists and is verified
    const partner = await Partner.findOne({
      userId: value.partnerId,
      verified: true,
      deletedAt: null,
    })

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found or not verified",
      })
    }

    // Create lead
    const leadData = {
      ...value,
      clientId: req.user.id,
      partnerId: value.partnerId,
    }

    const lead = new Lead(leadData)
    await lead.save()

    // Populate the lead with user details
    await lead.populate([
      { path: "clientId", select: "username email profilePic" },
      { path: "partnerId", select: "username email profilePic" },
    ])

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: { lead },
    })
  } catch (error) {
    console.error("Create lead error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to create lead",
    })
  }
})

// Get leads for current user (different views for clients and partners)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, status, sortBy = "createdAt", sortOrder = "desc" } = req.query

    const query = { deletedAt: null }

    // Filter based on user type
    if (req.user.userType === "client") {
      query.clientId = req.user.id
    } else if (req.user.userType === "partner") {
      query.partnerId = req.user.id
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    // Add status filter if provided
    if (status) {
      query.status = status
    }

    // Build sort object
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    const leads = await Lead.find(query)
      .populate("clientId", "username email profilePic phone")
      .populate("partnerId", "username email profilePic phone")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Lead.countDocuments(query)

    res.json({
      success: true,
      data: {
        leads,
        pagination: {
          page: Number.parseInt(page),
          limit: Number.parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error("Get leads error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch leads",
    })
  }
})

// Get single lead details
router.get("/:leadId", async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.leadId)
      .populate("clientId", "username email profilePic phone address")
      .populate("partnerId", "username email profilePic phone")
      .populate("notes.addedBy", "username")

    if (!lead || lead.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      })
    }

    // Check access permissions
    const hasAccess =
      req.user.userType === "admin" ||
      lead.clientId._id.toString() === req.user.id ||
      lead.partnerId._id.toString() === req.user.id

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    res.json({
      success: true,
      data: { lead },
    })
  } catch (error) {
    console.error("Get lead details error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch lead details",
    })
  }
})

// Update lead (partners can update status, clients can update details)
router.patch("/:leadId", async (req, res) => {
  try {
    const { error, value } = updateLeadSchema.validate(req.body)
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        details: error.details[0].message,
      })
    }

    const lead = await Lead.findById(req.params.leadId)

    if (!lead || lead.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      })
    }

    // Check permissions
    const isClient = lead.clientId.toString() === req.user.id
    const isPartner = lead.partnerId.toString() === req.user.id
    const isAdmin = req.user.userType === "admin"

    if (!isClient && !isPartner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    // Partners can only update status and priority
    if (isPartner && !isAdmin) {
      const allowedFields = ["status", "priority"]
      const updates = {}
      Object.keys(value).forEach((key) => {
        if (allowedFields.includes(key)) {
          updates[key] = value[key]
        }
      })

      if (updates.status && updates.status !== lead.status) {
        await lead.updateStatus(updates.status, req.user.id)
      } else {
        Object.assign(lead, updates)
        await lead.save()
      }
    } else {
      // Clients and admins can update all fields
      if (value.status && value.status !== lead.status) {
        await lead.updateStatus(value.status, req.user.id)
        delete value.status // Remove from value as it's already updated
      }

      Object.assign(lead, value)
      await lead.save()
    }

    await lead.populate([
      { path: "clientId", select: "username email profilePic" },
      { path: "partnerId", select: "username email profilePic" },
    ])

    res.json({
      success: true,
      message: "Lead updated successfully",
      data: { lead },
    })
  } catch (error) {
    console.error("Update lead error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update lead",
    })
  }
})

// Add note to lead
router.post("/:leadId/notes", async (req, res) => {
  try {
    const { note } = req.body

    if (!note || note.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Note content is required",
      })
    }

    const lead = await Lead.findById(req.params.leadId)

    if (!lead || lead.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      })
    }

    // Check permissions
    const hasAccess =
      req.user.userType === "admin" ||
      lead.clientId.toString() === req.user.id ||
      lead.partnerId.toString() === req.user.id

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    await lead.addNote(note.trim(), req.user.id)

    await lead.populate("notes.addedBy", "username")

    res.json({
      success: true,
      message: "Note added successfully",
      data: { lead },
    })
  } catch (error) {
    console.error("Add note error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to add note",
    })
  }
})

// Delete lead (soft delete)
router.delete("/:leadId", async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.leadId)

    if (!lead || lead.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      })
    }

    // Only clients who created the lead or admins can delete
    const canDelete = lead.clientId.toString() === req.user.id || req.user.userType === "admin"

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    await lead.softDelete()

    res.json({
      success: true,
      message: "Lead deleted successfully",
    })
  } catch (error) {
    console.error("Delete lead error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to delete lead",
    })
  }
})

// Get partner lead statistics (for partner dashboard)
router.get("/stats/partner", authorize("partner"), async (req, res) => {
  try {
    const { startDate, endDate, period = "30" } = req.query

    let dateRange = {}
    if (startDate && endDate) {
      dateRange = { startDate, endDate }
    } else {
      // Default to last 30 days or specified period
      const days = Number.parseInt(period) || 30
      dateRange = {
        startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        endDate: new Date(),
      }
    }

    const stats = await Lead.getPartnerStats(req.user.id, dateRange)

    // Get recent leads
    const recentLeads = await Lead.find({
      partnerId: req.user.id,
      deletedAt: null,
    })
      .populate("clientId", "username email profilePic")
      .sort({ createdAt: -1 })
      .limit(5)

    // Get leads by priority
    const priorityStats = await Lead.aggregate([
      {
        $match: {
          partnerId: req.user.id,
          deletedAt: null,
          ...(dateRange.startDate && {
            createdAt: {
              $gte: new Date(dateRange.startDate),
              $lte: new Date(dateRange.endDate),
            },
          }),
        },
      },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ])

    res.json({
      success: true,
      data: {
        ...stats,
        recentLeads,
        priorityBreakdown: priorityStats,
        dateRange,
      },
    })
  } catch (error) {
    console.error("Get partner stats error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch partner statistics",
    })
  }
})

module.exports = router
