const mongoose = require("mongoose");

const lawyerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    specialization: {
      type: [String],
      enum: ["criminal", "family", "corporate", "civil", "property"],
      required: false,
    },
    
    courtType: {
      type: [String],
      enum: ["Civil Court", "High Court", "Supreme Court"],
      default: ["Civil Court"],
    },

    ratePerMinute: {
      type: Number,
      required: false,
      min: 1,
    },

    experienceYears: {
      type: Number,
      default: 0,
    },

    barCouncilId: {
      type: String,
      trim: true,
    },

    profileCompleted: {
      type: Boolean,
      default: false,
    },

    bio: {
      type: String,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    refreshToken: {
      type: String,
      default: null,
    },

    rating: {
      type: Number,
      default: 0,
    },

    totalReviews: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    availableBalance: {
      type: Number,
      default: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
    },
    bankDetails: {
      accountHolder: String,
      accountNumber: String,
      ifscCode: String,
      bankName: String,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: "2dsphere",
      },
    },
    district: String,
    state: String,
    address: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Lawyer || mongoose.model("Lawyer", lawyerSchema);
