const Lawyer = require("../modals/Lawyer");
const User = require("../modals/authModal");
const ConsultSession = require("../modals/consultSession");
const WalletTransaction = require("../modals/WalletTransaction");
const LawyerEarning = require("../modals/LawyerEarning");
const SystemSettings = require("../modals/SystemSettings");
const mongoose = require("mongoose");
const { RtcTokenBuilder, RtcRole } = require("agora-token");

const { sessions } = require("../utils/sessionBilling");
const { acquireLock, releaseLock } = require("../utils/lock");

const MIN_BALANCE = 15;
const BILLING_INTERVAL = 10000; // 10 seconds

// Default fallback commission
let COMMISSION_PERCENT = 20;

// Helper to get latest settings
const getLatestCommission = async () => {
  try {
    const settings = await SystemSettings.findOne();
    if (settings) {
      COMMISSION_PERCENT = settings.commissionPercentage;
    }
  } catch (err) {
    console.error("Error fetching settings:", err);
  }
  return COMMISSION_PERCENT;
};

/* =====================================================
   START CONSULTATION
===================================================== */

const startConsultation = async (req, res) => {
  try {
    const io = req.app.get("io");

    const userId = req.user.id;
    const { lawyerId, type } = req.body;

    if (!lawyerId || !type) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    /* 🔎 Prevent duplicate active session (DB level protection) */
    const existingActiveSession = await ConsultSession.findOne({
      userId,
      status: "ACTIVE",
    });

    if (existingActiveSession) {
      return res.status(409).json({
        message: "Consultation already in progress",
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.walletBalance < MIN_BALANCE) {
      return res.status(400).json({
        message: "Insufficient wallet balance. Please recharge.",
      });
    }

    const lawyer = await Lawyer.findById(lawyerId);
    if (!lawyer || !lawyer.isVerified) {
      return res.status(404).json({ message: "Lawyer not available" });
    }

    if (!lawyer.isOnline) {
      return res.status(400).json({ message: "Lawyer is offline" });
    }

    /* 🔐 REDIS LOCK */
    const lawyerLockKey = `lock:lawyer:${lawyerId}`;
    const userLockKey = `lock:user:${userId}`;

    const lawyerLocked = await acquireLock(lawyerLockKey, 300);
    const userLocked = await acquireLock(userLockKey, 300);

    if (!lawyerLocked || !userLocked) {
      if (lawyerLocked) await releaseLock(lawyerLockKey);
      if (userLocked) await releaseLock(userLockKey);

      return res.status(409).json({
        message: "Consultation already in progress",
      });
    }

    /* 🟢 CREATE SESSION */
    const session = await ConsultSession.create({
      userId,
      lawyerId,
      type,
      ratePerMinute: lawyer.ratePerMinute,
      status: "REQUESTED",
      totalAmount: 0,
    });

    const room = `session:${session._id}`;

    /* 🔔 NOTIFY LAWYER */
    io.to(`user:${lawyerId}`).emit("CONSULT_REQUEST", {
      sessionId: session._id,
      userId,
      userName: user.name,
      type,
      ratePerMinute: lawyer.ratePerMinute,
    });

    res.status(201).json({
      message: "Consultation requested",
      sessionId: session._id,
      ratePerMinute: lawyer.ratePerMinute,
      startedAt: session.startedAt,
    });

  } catch (error) {
    console.error("CONSULT START ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   ACCEPT CONSULTATION
===================================================== */

const acceptConsultation = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { sessionId } = req.params;
    const lawyerId = req.user.id;

    const session = await ConsultSession.findById(sessionId);
    if (!session || session.status !== "REQUESTED") {
      return res.status(404).json({ message: "Consultation request not found" });
    }

    if (session.lawyerId.toString() !== lawyerId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    session.status = "ACTIVE";
    session.startedAt = new Date();
    await session.save();

    const room = `session:${session._id}`;
    io.to(room).emit("CONSULT_ACCEPTED", {
      sessionId: session._id,
      startedAt: session.startedAt,
    });

    /* 🔥 START BILLING */
    startBillingInterval(io, session);

    res.status(200).json({ message: "Consultation accepted" });

  } catch (error) {
    console.error("CONSULT ACCEPT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   DECLINE CONSULTATION
===================================================== */

const declineConsultation = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { sessionId } = req.params;
    const lawyerId = req.user.id;

    const session = await ConsultSession.findById(sessionId);
    if (!session || session.status !== "REQUESTED") {
      return res.status(404).json({ message: "Consultation request not found" });
    }

    if (session.lawyerId.toString() !== lawyerId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    session.status = "DECLINED";
    session.endedAt = new Date();
    await session.save();

    const room = `session:${session._id}`;
    io.to(room).emit("CONSULT_DECLINED", {
      sessionId: session._id,
      reason: "Lawyer declined the request",
    });

    /* 🔓 RELEASE LOCKS */
    await releaseLock(`lock:lawyer:${session.lawyerId}`);
    await releaseLock(`lock:user:${session.userId}`);

    res.status(200).json({ message: "Consultation declined" });

  } catch (error) {
    console.error("CONSULT DECLINE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   BILLING ENGINE HELPER
===================================================== */

const startBillingInterval = (io, session) => {
  const sessionIdStr = session._id.toString();
  const userId = session.userId;
  const room = `session:${sessionIdStr}`;

  const interval = setInterval(async () => {
    try {
      // 1. Fetch fresh state
      const freshSession = await ConsultSession.findById(session._id);
      if (!freshSession || freshSession.status !== "ACTIVE") {
        clearInterval(interval);
        sessions.delete(sessionIdStr);
        return;
      }

      const perMinuteRate = freshSession.ratePerMinute;
      const deduction = (perMinuteRate / 60) * (BILLING_INTERVAL / 1000);

      // 2. Atomic Wallet Deduction
      // We only debit if balance is sufficient to prevent negative balance
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: deduction } },
        { $inc: { walletBalance: -deduction } },
        { new: true }
      );

      if (!updatedUser) {
        // INSUFFICIENT BALANCE -> Force End
        console.log(`Insufficient balance for user ${userId}, force ending session ${sessionIdStr}`);

        // Final drain of whatever is left
        const userToDrain = await User.findById(userId);
        const remaining = userToDrain.walletBalance;

        // Atomic final drain
        const finalUser = await User.findOneAndUpdate(
          { _id: userId, walletBalance: remaining },
          { $set: { walletBalance: 0 } },
          { new: true }
        );

        if (finalUser) {
          await WalletTransaction.create({
            userId,
            type: "DEBIT",
            amount: remaining,
            reason: "CONSULTATION",
            referenceId: sessionIdStr,
            balanceAfter: 0,
          });
          freshSession.totalAmount += remaining;
        }

        freshSession.status = "FORCE_ENDED";
        freshSession.endedAt = new Date();
        await freshSession.save();

        // Finalize Earnings (This will be moved to a transaction-safe helper in Part 1)
        await finalizeEarning(freshSession, io, room, "INSUFFICIENT_BALANCE");

        clearInterval(interval);
        sessions.delete(sessionIdStr);
        return;
      }

      // 3. Record Transaction & Update Session Total
      await WalletTransaction.create({
        userId,
        type: "DEBIT",
        amount: deduction,
        reason: "CONSULTATION",
        referenceId: sessionIdStr,
        balanceAfter: updatedUser.walletBalance,
      });

      freshSession.totalAmount += deduction;
      await freshSession.save();

      io.to(room).emit("SESSION_UPDATE", {
        totalAmount: freshSession.totalAmount,
        remainingBalance: updatedUser.walletBalance,
      });

    } catch (err) {
      console.error("Billing error:", err);
    }
  }, BILLING_INTERVAL);

  sessions.set(sessionIdStr, interval);
};

/* =====================================================
   MANUAL END CONSULTATION
===================================================== */

const endConsultation = async (req, res) => {
  try {
    const io = req.app.get("io");

    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await ConsultSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Consultation session not found" });
    }

    if (session.userId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // If session is already ended, just return its summary
    if (session.status === "ENDED" || session.status === "FORCE_ENDED") {
      const { commissionAmount, lawyerAmount } = await finalizeEarning(session, io, `session:${sessionId}`);
      return res.status(200).json({
        message: "Session summary",
        totalAmount: session.totalAmount,
        remainingBalance: (await User.findById(userId)).walletBalance,
        commission: commissionAmount,
        lawyerEarning: lawyerAmount,
      });
    }

    if (session.status !== "ACTIVE") {
      return res.status(400).json({ message: "Only active sessions can be ended" });
    }

    const room = `session:${sessionId}`;
    const lawyerLockKey = `lock:lawyer:${session.lawyerId}`;
    const userLockKey = `lock:user:${userId}`;

    /* 🔥 STOP BILLING */
    const activeInterval = sessions.get(sessionId);
    if (activeInterval) {
      clearInterval(activeInterval);
      sessions.delete(sessionId);
    }

    session.status = "ENDED";
    session.endedAt = new Date();
    await session.save();

    // Finalize Earnings with Transaction
    const { commissionAmount, lawyerAmount } = await finalizeEarning(session, io, room);

    /* 🔓 RELEASE LOCKS */
    await releaseLock(lawyerLockKey);
    await releaseLock(userLockKey);

    const user = await User.findById(userId);

    res.status(200).json({
      message: "Consultation ended successfully",
      totalAmount: session.totalAmount,
      remainingBalance: user.walletBalance,
      commission: commissionAmount,
      lawyerEarning: lawyerAmount,
    });

  } catch (error) {
    console.error("CONSULT END ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const finalizeEarning = async (session, io, room, forceReason = null) => {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const currentCommission = await getLatestCommission();
    const commissionAmount = (session.totalAmount * currentCommission) / 100;
    const lawyerAmount = session.totalAmount - commissionAmount;

    // 1. Double check session status in DB within transaction
    const freshSession = await ConsultSession.findById(session._id).session(mongoSession);

    // 2. Atomically create Earning record (Unique index on sessionId protects us from duplicates)
    // If it already exists, LawyerEarning.create will throw an error and we abort transaction
    try {
      await LawyerEarning.create([{
        sessionId: session._id,
        lawyerId: session.lawyerId,
        totalAmount: session.totalAmount,
        commissionAmount,
        lawyerAmount,
      }], { session: mongoSession });
    } catch (err) {
      if (err.code === 11000) {
        console.log("Earning already exists for session:", session._id);
        await mongoSession.abortTransaction();
        return { commissionAmount: 0, lawyerAmount: 0 }; // Already processed
      }
      throw err;
    }

    // 3. Atomically update Lawyer Balances
    const updatedLawyer = await Lawyer.findByIdAndUpdate(
      session.lawyerId,
      {
        $inc: {
          pendingBalance: lawyerAmount
        }
      },
      { session: mongoSession, new: true }
    );

    if (!updatedLawyer) {
      throw new Error("Lawyer not found during balance update");
    }

    await mongoSession.commitTransaction();

    // Notify via Socket
    if (forceReason) {
      io.to(room).emit("SESSION_FORCE_ENDED", {
        totalAmount: session.totalAmount,
        remainingBalance: 0,
        commission: commissionAmount,
        lawyerEarning: lawyerAmount,
        reason: forceReason,
      });

      /* 🔓 RELEASE LOCKS for force end */
      await releaseLock(`lock:lawyer:${session.lawyerId}`);
      await releaseLock(`lock:user:${session.userId}`);
    } else {
      io.to(room).emit("SESSION_ENDED", {
        totalAmount: session.totalAmount,
        commission: commissionAmount,
        lawyerEarning: lawyerAmount,
      });
    }

    return { commissionAmount, lawyerAmount };
  } catch (error) {
    await mongoSession.abortTransaction();
    console.error("FINALIZE EARNING ERROR 👉", error);
    throw error;
  } finally {
    mongoSession.endSession();
  }
};

const recoverActiveSessions = async (io) => {
  try {
    console.log("🔄 Recovering active sessions...");
    const activeSessions = await ConsultSession.find({ status: "ACTIVE" });

    for (const session of activeSessions) {
      if (sessions.has(session._id.toString())) continue;
      console.log(`Resuming billing for session: ${session._id}`);
      startBillingInterval(io, session);
    }
  } catch (error) {
    console.error("Session recovery failed:", error);
  }
};

const getConsultationSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await ConsultSession.findById(sessionId)
      .populate("userId", "name profileImage")
      .populate("lawyerId", "name specialization");

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.status(200).json({ success: true, session });
  } catch (error) {
    console.error("GET CONSULT SESSION ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getLawyerConsultations = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const consultations = await ConsultSession.find({ lawyerId })
      .populate("userId", "name profileImage")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, consultations });
  } catch (error) {
    console.error("GET LAWYER CONSULTATIONS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const cancelConsultation = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await ConsultSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    if (session.userId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (session.status !== "REQUESTED") {
      return res.status(400).json({
        message: `Cannot cancel session with status: ${session.status}`
      });
    }

    session.status = "CANCELLED";
    session.endedAt = new Date();
    await session.save();

    const room = `session:${session._id}`;
    io.to(room).emit("CONSULT_CANCELLED", {
      sessionId: session._id,
      reason: "User cancelled the request",
    });

    // Notify lawyer directly to clear their modal if they haven't seen the room update
    io.to(`user:${session.lawyerId}`).emit("CONSULT_CANCELLED", {
      sessionId: session._id,
    });

    /* 🔓 RELEASE LOCKS */
    await releaseLock(`lock:lawyer:${session.lawyerId}`);
    await releaseLock(`lock:user:${session.userId}`);

    res.status(200).json({ message: "Consultation cancelled successfully" });

  } catch (error) {
    console.error("CONSULT CANCEL ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getUserConsultations = async (req, res) => {
  try {
    const userId = req.user.id;
    const consultations = await ConsultSession.find({ userId })
      .populate("lawyerId", "name specialization profileImage")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, consultations });
  } catch (error) {
    console.error("GET USER CONSULTATIONS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const generateAgoraTokenForSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await ConsultSession.findById(sessionId);
    if (!session || (session.status !== "ACTIVE" && session.status !== "REQUESTED")) {
      return res.status(404).json({ message: "Consultation not in a valid state for calling" });
    }

    // Check if user is part of the session
    if (session.userId.toString() !== userId && session.lawyerId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    const channelName = sessionId;
    const uid = 0; // 0 means let Agora assign a UID
    const role = RtcRole.PUBLISHER;

    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    if (!appId || !appCertificate || appId === "YOUR_APP_ID") {
      return res.status(500).json({ message: "Agora credentials not configured on server" });
    }

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    res.status(200).json({
      token,
      uid,
      channelName,
      appId
    });
  } catch (error) {
    console.error("AGORA TOKEN GENERATION ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  startConsultation,
  acceptConsultation,
  declineConsultation,
  cancelConsultation,
  endConsultation,
  getConsultationSession,
  getLawyerConsultations,
  getUserConsultations,
  recoverActiveSessions,
  generateAgoraTokenForSession,
};
