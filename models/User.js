const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phone: {
      countryCode: {
        type: String,
        required: true,
      },
      number: {
        type: String,
        required: true,
      },
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    profilePic: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      required: true,
    },
    userType: {
      type: String,
      enum: ["client", "partner", "admin"],
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
    },
    isActive: {
      type: Boolean,
      default: true,
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
);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ firebaseUid: 1 });
userSchema.index({ deletedAt: 1 });

// Virtual for full phone number
userSchema.virtual("fullPhone").get(function () {
  return `${this.phone.countryCode}${this.phone.number}`;
});

// Pre-save middleware
userSchema.pre("save", function (next) {
  if (this.isModified("email")) {
    this.email = this.email.toLowerCase();
  }
  next();
});

// Instance methods
userSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

userSchema.methods.restore = function () {
  this.deletedAt = null;
  this.isActive = true;
  return this.save();
};

// Static methods
userSchema.statics.findActive = function () {
  return this.find({ deletedAt: null, isActive: true });
};

userSchema.statics.findByFirebaseUid = function (uid) {
  return this.findOne({ firebaseUid: uid, deletedAt: null });
};

module.exports = mongoose.model("User", userSchema);
