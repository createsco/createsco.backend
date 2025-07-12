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

// No additional indexes required; unique field above already creates an index

module.exports = mongoose.model("Client", clientSchema);
