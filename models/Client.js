const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    favouritePartners: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Partner",
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes
clientSchema.index({ userId: 1 });

module.exports = mongoose.model("Client", clientSchema);
