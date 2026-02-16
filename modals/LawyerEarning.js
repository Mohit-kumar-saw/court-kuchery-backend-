const mongoose = require("mongoose");

const lawyerEarningSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ConsultSession",
      required: true,
      unique: true, // one earning per session
    },

    lawyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lawyer",
      required: true,
      index: true,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    commissionAmount: {
      type: Number,
      required: true,
    },

    lawyerAmount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.LawyerEarning ||
  mongoose.model("LawyerEarning", lawyerEarningSchema);
