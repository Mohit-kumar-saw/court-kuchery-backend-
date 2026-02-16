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
      required: true,
    },

    ratePerMinute: {
      type: Number,
      required: true,
      min: 1,
    },

    experienceYears: {
      type: Number,
      default: 0,
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
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Lawyer || mongoose.model("Lawyer", lawyerSchema);
