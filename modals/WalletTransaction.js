const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    reason: {
      type: String,
      enum: ["RECHARGE", "CONSULTATION", "REFUND", "LAWYER_WITHDRAWAL"],
      required: true,
    },

    referenceId: {
      type: String, // Razorpay payment ID / session ID
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const WalletTransaction = mongoose.model(
  "WalletTransaction",
  walletTransactionSchema
);

module.exports = WalletTransaction;
