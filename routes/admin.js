const express = require("express")
const Partner = require("../models/Partner")
const User = require("../models/User")
const Lead = require("../models/Lead")
const { verifyFirebaseToken, authorize, requireEmailVerification } = require("../middleware/firebaseAuth")
const { sanitizeInput } = require("../middleware/security")
const { sendPartnerVerificationEmail, sendPartnerRejectionEmail } = require("../utils/emailService")

const router = express.Router()

// Apply middleware
router.use(sanitizeInput)
router.use(verifyFirebaseToken)
router.use(authorize("admin"))

// Get dashboard statistics
router.get("/dashboard/stats", async (req, res) => {
  try {
    const stats = await Promise.all([
      Partner.countDocuments({ onboardingStatus: "pending_verification" }),
      Partner.countDocuments({ onboardingStatus: "verified" }),
      Partner.countDocuments({ onboardingStatus: "rejected" }),
      Partner.countDocuments({ onboardingStatus: "incomplete" }),
      User.countDocuments({ userType: "partner" }),
      User.countDocuments({ userType: "client" }),
      Lead.countDocuments({ deletedAt: null }),
      Lead.countDocuments({ status: "new", deletedAt: null }),
      Lead.countDocuments({ status: "converted", deletedAt: null }),
    ])

    res.json({
      success: true,
      data: {
        pendingVerification: stats[0],
        verifiedPartners: stats[1],
        rejectedPartners: stats[2],
        incompleteOnboarding: stats[3],
        totalPartners: stats[4],
        totalClients: stats[5],
        totalLeads: stats[6],
        newLeads: stats[7],
        convertedLeads: stats[8],
      },
    })
  } catch (error) {
    console.error("Get admin stats error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics",
    })
  }
})

// Get comprehensive lead statistics for admin
router.get("/leads/stats", async (req, res) => {
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

    const stats = await Lead.getAdminStats(dateRange)

    // Get conversion funnel
    const funnelStats = await Lead.aggregate([
      {
        $match: {
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
          _id: null,
          totalLeads: { $sum: 1 },
          contactedLeads: {
            $sum: { $cond: [{ $ne: ["$status", "new"] }, 1, 0] },
          },
          convertedLeads: {
            $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
          },
          closedLeads: {
            $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] },
          },
        },
      },
    ])

    // Get source breakdown
    const sourceStats = await Lead.aggregate([
      {
        $match: {
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
          _id: "$source",
          count: { $sum: 1 },
          converted: {
            $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          conversionRate: {
            $multiply: [{ $divide: ["$converted", "$count"] }, 100],
          },
        },
      },
    ])

    // Get average response times by partner
    const responseTimeStats = await Lead.aggregate([
      {
        $match: {
          deletedAt: null,
          contactedAt: { $ne: null },
          ...(dateRange.startDate && {
            createdAt: {
              $gte: new Date(dateRange.startDate),
              $lte: new Date(dateRange.endDate),
            },
          }),
        },
      },
      {
        $addFields: {
          responseTimeHours: {
            $divide: [{ $subtract: ["$contactedAt", "$createdAt"] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: "$responseTimeHours" },
          medianResponseTime: { $median: "$responseTimeHours" },
        },
      },
    ])

    res.json({
      success: true,
      data: {
        ...stats,
        conversionFunnel: funnelStats[0] || {
          totalLeads: 0,
          contactedLeads: 0,
          convertedLeads: 0,
          closedLeads: 0,
        },
        sourceBreakdown: sourceStats,
        responseTimeStats: responseTimeStats[0] || {
          avgResponseTime: 0,
          medianResponseTime: 0,
        },
        dateRange,
      },
    })
  } catch (error) {
    console.error("Get admin lead stats error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch lead statistics",
    })
  }
})

// Get all leads for admin with advanced filtering
router.get("/leads", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      source,
      priority,
      partnerId,
      clientId,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
    } = req.query

    const query = { deletedAt: null }

    // Add filters
    if (status) query.status = status
    if (source) query.source = source
    if (priority) query.priority = priority
    if (partnerId) query.partnerId = partnerId
    if (clientId) query.clientId = clientId

    // Date range filter
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      }
    }

    // Build sort object
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    // Build aggregation pipeline for search
    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "clientId",
          foreignField: "_id",
          as: "client",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "partnerId",
          foreignField: "_id",
          as: "partner",
        },
      },
      {
        $unwind: "$client",
      },
      {
        $unwind: "$partner",
      },
    ]

    // Add search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "client.username": { $regex: search, $options: "i" } },
            { "client.email": { $regex: search, $options: "i" } },
            { "partner.username": { $regex: search, $options: "i" } },
            { "partner.email": { $regex: search, $options: "i" } },
            { message: { $regex: search, $options: "i" } },
            { serviceType: { $regex: search, $options: "i" } },
            { location: { $regex: search, $options: "i" } },
          ],
        },
      })
    }

    // Add other filters
    if (Object.keys(query).length > 0) {
      pipeline.push({ $match: query })
    }

    // Add sorting
    pipeline.push({ $sort: sort })

    // Add pagination
    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit * 1 })

    // Add client and partner profile lookup
    pipeline.push(
      {
        $lookup: {
          from: "partners",
          localField: "partnerId",
          foreignField: "userId",
          as: "partnerProfile",
        },
      },
      {
        $addFields: {
          partnerProfile: { $arrayElemAt: ["$partnerProfile", 0] },
        },
      },
    )

    const leads = await Lead.aggregate(pipeline)

    // Get total count for pagination
    const totalPipeline = [...pipeline.slice(0, -2), { $count: "total" }]
    const totalResult = await Lead.aggregate(totalPipeline)
    const total = totalResult[0]?.total || 0

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
    console.error("Get admin leads error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch leads",
    })
  }
})

// Get all partners pending verification
router.get("/partners/pending", async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = req.query

    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    const partners = await Partner.find({ onboardingStatus: "pending_verification" })
      .populate("userId", "username email phone createdAt")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Partner.countDocuments({ onboardingStatus: "pending_verification" })

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
    console.error("Get pending partners error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending partners",
    })
  }
})

// Get all partners (with filters)
router.get("/partners", async (req, res) => {
  try {
    const { page = 1, limit = 10, status, verified, sortBy = "createdAt", sortOrder = "desc", search } = req.query

    const query = {}

    // Add filters
    if (status) {
      query.onboardingStatus = status
    }

    if (verified !== undefined) {
      query.verified = verified === "true"
    }

    // Build sort object
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    // Build aggregation pipeline for search
    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
    ]

    // Add search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "user.username": { $regex: search, $options: "i" } },
            { "user.email": { $regex: search, $options: "i" } },
            { companyName: { $regex: search, $options: "i" } },
          ],
        },
      })
    }

    // Add status filters
    if (Object.keys(query).length > 0) {
      pipeline.push({ $match: query })
    }

    // Add sorting
    pipeline.push({ $sort: sort })

    // Add pagination
    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit * 1 })

    const partners = await Partner.aggregate(pipeline)
    const totalPipeline = [...pipeline.slice(0, -2), { $count: "total" }]
    const totalResult = await Partner.aggregate(totalPipeline)
    const total = totalResult[0]?.total || 0

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

// Get single partner details for verification
router.get("/partners/:partnerId", async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.partnerId).populate(
      "userId",
      "username email phone profilePic address createdAt emailVerified phoneVerified",
    )

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
    console.error("Get partner details error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch partner details",
    })
  }
})

// Verify/Approve partner
router.patch("/partners/:partnerId/verify", async (req, res) => {
  try {
    const { notes } = req.body

    const partner = await Partner.findById(req.params.partnerId).populate("userId", "username email")

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      })
    }

    if (partner.onboardingStatus !== "pending_verification") {
      return res.status(400).json({
        success: false,
        message: "Partner is not pending verification",
      })
    }

    // Check if all documents are approved
    const hasRejectedDocs = partner.documents.some((doc) => doc.status === "rejected")
    const hasPendingDocs = partner.documents.some((doc) => doc.status === "pending")

    if (hasRejectedDocs || hasPendingDocs) {
      return res.status(400).json({
        success: false,
        message: "All documents must be approved before verifying partner",
      })
    }

    // Update partner status
    partner.onboardingStatus = "verified"
    partner.verified = true
    partner.verificationDate = new Date()
    partner.verificationNotes = notes
    partner.verifiedBy = req.user.id

    await partner.save()

    // Send verification email
    await sendPartnerVerificationEmail(partner.userId.email, partner.userId.username, {
      companyName: partner.companyName,
      verificationDate: partner.verificationDate,
      notes: notes,
    })

    res.json({
      success: true,
      message: "Partner verified successfully",
      data: { partner },
    })
  } catch (error) {
    console.error("Verify partner error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to verify partner",
    })
  }
})

// Reject partner
router.patch("/partners/:partnerId/reject", async (req, res) => {
  try {
    const { reason, notes } = req.body

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      })
    }

    const partner = await Partner.findById(req.params.partnerId).populate("userId", "username email")

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      })
    }

    if (partner.onboardingStatus !== "pending_verification") {
      return res.status(400).json({
        success: false,
        message: "Partner is not pending verification",
      })
    }

    // Update partner status
    partner.onboardingStatus = "rejected"
    partner.verified = false
    partner.rejectionReason = reason
    partner.rejectionNotes = notes
    partner.rejectionDate = new Date()
    partner.rejectedBy = req.user.id

    await partner.save()

    // Send rejection email
    await sendPartnerRejectionEmail(partner.userId.email, partner.userId.username, {
      companyName: partner.companyName,
      reason: reason,
      notes: notes,
      rejectionDate: partner.rejectionDate,
    })

    res.json({
      success: true,
      message: "Partner rejected successfully",
      data: { partner },
    })
  } catch (error) {
    console.error("Reject partner error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to reject partner",
    })
  }
})

// Approve document
router.patch("/partners/:partnerId/documents/:documentId/approve", async (req, res) => {
  try {
    const { notes } = req.body

    const partner = await Partner.findById(req.params.partnerId)

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      })
    }

    const document = partner.documents.id(req.params.documentId)

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      })
    }

    document.status = "approved"
    document.reviewedAt = new Date()
    document.reviewedBy = req.user.id
    document.reviewNotes = notes

    await partner.save()

    // Check if all documents are now approved
    const allApproved = partner.documents.every((doc) => doc.status === "approved")

    res.json({
      success: true,
      message: "Document approved successfully",
      data: {
        document,
        allDocumentsApproved: allApproved,
      },
    })
  } catch (error) {
    console.error("Approve document error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to approve document",
    })
  }
})

// Reject document
router.patch("/partners/:partnerId/documents/:documentId/reject", async (req, res) => {
  try {
    const { reason, notes } = req.body

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      })
    }

    const partner = await Partner.findById(req.params.partnerId)

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      })
    }

    const document = partner.documents.id(req.params.documentId)

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      })
    }

    document.status = "rejected"
    document.rejectionReason = reason
    document.reviewedAt = new Date()
    document.reviewedBy = req.user.id
    document.reviewNotes = notes

    await partner.save()

    res.json({
      success: true,
      message: "Document rejected successfully",
      data: { document },
    })
  } catch (error) {
    console.error("Reject document error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to reject document",
    })
  }
})

// Get verification history
router.get("/partners/:partnerId/history", async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.partnerId)
      .populate("verifiedBy", "username email")
      .populate("rejectedBy", "username email")
      .populate("documents.reviewedBy", "username email")

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      })
    }

    const history = []

    // Add verification/rejection events
    if (partner.verificationDate) {
      history.push({
        type: "verification",
        action: "verified",
        date: partner.verificationDate,
        by: partner.verifiedBy,
        notes: partner.verificationNotes,
      })
    }

    if (partner.rejectionDate) {
      history.push({
        type: "verification",
        action: "rejected",
        date: partner.rejectionDate,
        by: partner.rejectedBy,
        reason: partner.rejectionReason,
        notes: partner.rejectionNotes,
      })
    }

    // Add document review events
    partner.documents.forEach((doc) => {
      if (doc.reviewedAt) {
        history.push({
          type: "document",
          action: doc.status,
          date: doc.reviewedAt,
          by: doc.reviewedBy,
          documentName: doc.docName,
          reason: doc.rejectionReason,
          notes: doc.reviewNotes,
        })
      }
    })

    // Sort by date (newest first)
    history.sort((a, b) => new Date(b.date) - new Date(a.date))

    res.json({
      success: true,
      data: { history },
    })
  } catch (error) {
    console.error("Get verification history error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch verification history",
    })
  }
})

// Bulk actions

router.patch("/partners/bulk-action", async (req, res) => {
  try {
    const { action, partnerIds, reason, notes } = req.body

    if (!action || !partnerIds || !Array.isArray(partnerIds)) {
      return res.status(400).json({
        success: false,
        message: "Action and partner IDs are required",
      })
    }

    if (action === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required for bulk rejection",
      })
    }

    const partners = await Partner.find({
      _id: { $in: partnerIds },
      onboardingStatus: "pending_verification",
    }).populate("userId", "username email")

    if (partners.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No eligible partners found",
      })
    }

    const results = []

    for (const partner of partners) {
      try {
        if (action === "verify") {
          // Check if all documents are approved
          const hasRejectedDocs = partner.documents.some((doc) => doc.status === "rejected")
          const hasPendingDocs = partner.documents.some((doc) => doc.status === "pending")

          if (!hasRejectedDocs && !hasPendingDocs) {
            partner.onboardingStatus = "verified"
            partner.verified = true
            partner.verificationDate = new Date()
            partner.verificationNotes = notes
            partner.verifiedBy = req.user.id

            await partner.save()

            // Send verification email
            await sendPartnerVerificationEmail(partner.userId.email, partner.userId.username, {
              companyName: partner.companyName,
              verificationDate: partner.verificationDate,
              notes: notes,
            })

            results.push({ partnerId: partner._id, status: "verified", success: true })
          } else {
            results.push({
              partnerId: partner._id,
              status: "skipped",
              success: false,
              reason: "Documents not approved",
            })
          }
        } else if (action === "reject") {
          partner.onboardingStatus = "rejected"
          partner.verified = false
          partner.rejectionReason = reason
          partner.rejectionNotes = notes
          partner.rejectionDate = new Date()
          partner.rejectedBy = req.user.id

          await partner.save()

          // Send rejection email
          await sendPartnerRejectionEmail(partner.userId.email, partner.userId.username, {
            companyName: partner.companyName,
            reason: reason,
            notes: notes,
            rejectionDate: partner.rejectionDate,
          })

          results.push({ partnerId: partner._id, status: "rejected", success: true })
        }
      } catch (error) {
        results.push({
          partnerId: partner._id,
          status: "error",
          success: false,
          error: error.message,
        })
      }
    }

    res.json({
      success: true,
      message: `Bulk ${action} completed`,
      data: { results },
    })
  } catch (error) {
    console.error("Bulk action error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to perform bulk action",
    })
  }
})

module.exports = router
