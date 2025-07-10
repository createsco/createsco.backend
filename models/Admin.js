const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "admin", "moderator"],
      default: "admin",
    },
    permissions: {
      managePartners: { type: Boolean, default: true },
      manageUsers: { type: Boolean, default: false },
      manageContent: { type: Boolean, default: false },
      viewAnalytics: { type: Boolean, default: true },
      systemSettings: { type: Boolean, default: false },
    },
    socialLinks: {
      website: String,
      linkedin: String,
      twitter: String,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
adminSchema.index({ userId: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ isActive: 1 });

// Instance methods
adminSchema.methods.hasPermission = function (permission) {
  return this.permissions[permission] === true;
};

adminSchema.methods.updateLastActive = function () {
  this.lastActiveAt = new Date();
  return this.save();
};

// Static methods
adminSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

module.exports = mongoose.model("Admin", adminSchema);
