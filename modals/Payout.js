const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
    {
        lawyerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Lawyer",
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 1,
        },
        status: {
            type: String,
            enum: ["PENDING", "PAID", "FAILED"],
            default: "PENDING",
        },
        razorpayPayoutId: {
            type: String,
        },
        paidAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.models.Payout || mongoose.model("Payout", payoutSchema);
