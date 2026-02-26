const mongoose = require("mongoose");

const consultSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    lawyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lawyer",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["CHAT", "CALL", "VIDEO"],
      required: true,
    },

    ratePerMinute: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["REQUESTED", "ACTIVE", "ENDED", "FORCE_ENDED", "DECLINED", "CANCELLED"],
      default: "REQUESTED",
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    endedAt: Date,

    totalAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ConsultSession ||
  mongoose.model("ConsultSession", consultSessionSchema);
