const mongoose = require("mongoose")

const leadSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["new", "contacted", "converted", "closed"],
      default: "new",
      index: true,
    },
    // Additional useful fields
    contactMethod: {
      type: String,
      enum: ["email", "phone", "whatsapp", "website_form", "direct_message"],
      default: "website_form",
    },
    serviceType: {
      type: String,
      trim: true,
    },
    eventDate: {
      type: Date,
    },
    budget: {
      min: Number,
      max: Number,
      currency: {
        type: String,
        default: "INR",
      },
    },
    location: {
      type: String,
      trim: true,
    },
    // Tracking fields
    contactedAt: {
      type: Date,
    },
    convertedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
    notes: [
      {
        note: String,
        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    source: {
      type: String,
      enum: ["website", "social_media", "referral", "advertisement", "direct"],
      default: "website",
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Indexes for better performance
leadSchema.index({ clientId: 1, partnerId: 1 })
leadSchema.index({ status: 1, createdAt: -1 })
leadSchema.index({ partnerId: 1, status: 1 })
leadSchema.index({ createdAt: -1 })
leadSchema.index({ deletedAt: 1 })

// Virtual for response time (how long it took to contact)
leadSchema.virtual("responseTime").get(function () {
  if (this.contactedAt && this.createdAt) {
    return Math.floor((this.contactedAt - this.createdAt) / (1000 * 60 * 60)) // hours
  }
  return null
})

// Virtual for conversion time
leadSchema.virtual("conversionTime").get(function () {
  if (this.convertedAt && this.createdAt) {
    return Math.floor((this.convertedAt - this.createdAt) / (1000 * 60 * 60 * 24)) // days
  }
  return null
})

// Instance methods
leadSchema.methods.updateStatus = async function (newStatus, userId) {
  this.status = newStatus

  // Update timestamp based on status
  switch (newStatus) {
    case "contacted":
      this.contactedAt = new Date()
      break
    case "converted":
      this.convertedAt = new Date()
      break
    case "closed":
      this.closedAt = new Date()
      break
  }

  // Add a note about status change
  this.notes.push({
    note: `Status changed to ${newStatus}`,
    addedBy: userId,
    addedAt: new Date(),
  })

  return this.save()
}

leadSchema.methods.addNote = function (note, userId) {
  this.notes.push({
    note: note,
    addedBy: userId,
    addedAt: new Date(),
  })
  return this.save()
}

leadSchema.methods.softDelete = function () {
  this.deletedAt = new Date()
  return this.save()
}

// Static methods
leadSchema.statics.findActive = function () {
  return this.find({ deletedAt: null })
}

leadSchema.statics.getPartnerStats = async function (partnerId, dateRange = {}) {
  const { startDate, endDate } = dateRange
  const matchQuery = { partnerId, deletedAt: null }

  if (startDate && endDate) {
    matchQuery.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    }
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        avgResponseTime: {
          $avg: {
            $cond: [
              { $ne: ["$contactedAt", null] },
              {
                $divide: [{ $subtract: ["$contactedAt", "$createdAt"] }, 1000 * 60 * 60],
              },
              null,
            ],
          },
        },
      },
    },
  ])

  // Get total leads and conversion rate
  const totalLeads = await this.countDocuments(matchQuery)
  const convertedLeads = await this.countDocuments({ ...matchQuery, status: "converted" })
  const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0

  return {
    totalLeads,
    conversionRate: Math.round(conversionRate * 100) / 100,
    statusBreakdown: stats,
  }
}

leadSchema.statics.getAdminStats = async function (dateRange = {}) {
  const { startDate, endDate } = dateRange
  const matchQuery = { deletedAt: null }

  if (startDate && endDate) {
    matchQuery.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    }
  }

  const [statusStats, partnerStats, dailyStats] = await Promise.all([
    // Status breakdown
    this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),

    // Top performing partners
    this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$partnerId",
          totalLeads: { $sum: 1 },
          convertedLeads: {
            $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          conversionRate: {
            $multiply: [{ $divide: ["$convertedLeads", "$totalLeads"] }, 100],
          },
        },
      },
      { $sort: { totalLeads: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "partner",
        },
      },
      { $unwind: "$partner" },
      {
        $lookup: {
          from: "partners",
          localField: "_id",
          foreignField: "userId",
          as: "partnerProfile",
        },
      },
      { $unwind: "$partnerProfile" },
    ]),

    // Daily leads trend (last 30 days)
    this.aggregate([
      {
        $match: {
          ...matchQuery,
          createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ])

  const totalLeads = await this.countDocuments(matchQuery)

  return {
    totalLeads,
    statusBreakdown: statusStats,
    topPartners: partnerStats,
    dailyTrend: dailyStats,
  }
}

module.exports = mongoose.model("Lead", leadSchema)
