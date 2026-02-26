const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
    {
        commissionPercentage: {
            type: Number,
            default: 20,
        },
        maintenanceMode: {
            type: Boolean,
            default: false,
        },
        minWithdrawalAmount: {
            type: Number,
            default: 500,
        },
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
);

module.exports =
    mongoose.models.SystemSettings ||
    mongoose.model("SystemSettings", systemSettingsSchema);
