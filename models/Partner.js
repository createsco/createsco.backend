const mongoose = require("mongoose")

const partnerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    specializations: [String],
    documents: [
      {
        docName: String,
        fileUrl: String,
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        rejectionReason: String,
        reviewNotes: String,
        reviewedAt: {
          type: Date,
          default: null,
        },
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    banner: String,
    portfolio: [String],
    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },
    services: [
      {
        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          default: () => new mongoose.Types.ObjectId(),
        },
        name: {
          type: String,
          required: true,
        },
        description: String,
        basePrice: {
          type: Number,
          required: true,
          min: 0,
        },
        priceUnit: {
          type: String,
          enum: ["per_hour", "per_day", "per_project"],
          required: true,
        },
      },
    ],
    locationPricing: {
      type: Map,
      of: Number,
    },
    paymentMethods: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    servingLocations: [String],
    partnerType: {
      type: String,
      enum: ["studio", "solo", "firm", "partnership"],
    },
    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    socialLinks: {
      website: String,
      instagram: String,
      facebook: String,
      x: String,
      pinterest: String,
      youtube: String,
    },
    projectStats: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      ongoing: { type: Number, default: 0 },
    },
    dashboardData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    partnerLocations: [
      {
        city: String,
        state: String,
        coordinates: {
          lat: Number,
          lng: Number,
        },
        pinCodesServed: [String],
      },
    ],
    // Onboarding specific fields
    onboardingStatus: {
      type: String,
      enum: ["incomplete", "pending_verification", "verified", "rejected"],
      default: "incomplete",
    },
    onboardingStep: {
      type: Number,
      default: 1,
      min: 1,
      max: 5,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Admin verification fields
    verificationDate: {
      type: Date,
      default: null,
    },
    verificationNotes: {
      type: String,
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionDate: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    rejectionNotes: {
      type: String,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Add virtual for onboarding progress
partnerSchema.virtual("onboardingProgress").get(function () {
  let progress = 0

  // Basic info (20%)
  if (this.companyName && this.partnerType && this.experienceYears >= 0) {
    progress += 20
  }

  // Specializations (15%)
  if (this.specializations && this.specializations.length > 0) {
    progress += 15
  }

  // Services (25%)
  if (this.services && this.services.length > 0) {
    progress += 25
  }

  // Locations (20%)
  if (this.partnerLocations && this.partnerLocations.length > 0) {
    progress += 20
  }

  // Documents (20%)
  if (this.documents && this.documents.length > 0) {
    progress += 20
  }

  return Math.min(progress, 100)
})

// Add onboarding status update method
partnerSchema.methods.updateOnboardingStatus = async function () {
  const progress = this.onboardingProgress

  if (progress < 100) {
    this.onboardingStatus = "incomplete"
  } else if (this.documents.length === 0) {
    this.onboardingStatus = "incomplete"
  } else if (this.documents.some((doc) => doc.status === "pending")) {
    this.onboardingStatus = "pending_verification"
  } else if (this.documents.every((doc) => doc.status === "approved")) {
    this.onboardingStatus = "verified"
    this.verified = true
  } else if (this.documents.some((doc) => doc.status === "rejected")) {
    this.onboardingStatus = "rejected"
  }

  return this.save()
}

// Indexes
partnerSchema.index({ userId: 1 })
partnerSchema.index({ verified: 1 })
partnerSchema.index({ avgRating: -1 })
partnerSchema.index({ servingLocations: 1 })
partnerSchema.index({ specializations: 1 })
partnerSchema.index({ deletedAt: 1 })

// Virtual for completion rate
partnerSchema.virtual("completionRate").get(function () {
  if (this.projectStats.total === 0) return 0
  return (this.projectStats.completed / this.projectStats.total) * 100
})

// Instance methods
partnerSchema.methods.updateRating = async function (newRating) {
  const totalRating = this.avgRating * this.totalReviews + newRating
  this.totalReviews += 1
  this.avgRating = totalRating / this.totalReviews
  return this.save()
}

partnerSchema.methods.addService = function (service) {
  this.services.push(service)
  return this.save()
}

partnerSchema.methods.removeService = function (serviceId) {
  this.services = this.services.filter((service) => service.serviceId.toString() !== serviceId.toString())
  return this.save()
}

// Static methods
partnerSchema.statics.findVerified = function () {
  return this.find({ verified: true, deletedAt: null })
}

partnerSchema.statics.findByLocation = function (location) {
  return this.find({
    servingLocations: { $in: [location] },
    verified: true,
    deletedAt: null,
  })
}

module.exports = mongoose.model("Partner", partnerSchema)
