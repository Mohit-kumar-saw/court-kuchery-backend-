const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ConsultSession",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["USER", "LAWYER"],
      required: true,
    },
    messageType: {
      type: String,
      enum: ["TEXT", "IMAGE"],
      default: "TEXT",
    },
    content: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["SENT", "DELIVERED", "SEEN"],
      default: "SENT",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
