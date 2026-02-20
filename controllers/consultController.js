const Lawyer = require("../modals/Lawyer");
const User = require("../modals/authModal");
const ConsultSession = require("../modals/consultSession");
const WalletTransaction = require("../modals/WalletTransaction");
const LawyerEarning = require("../modals/LawyerEarning");

const { sessions } = require("../utils/sessionBilling");
const { acquireLock, releaseLock } = require("../utils/lock");

const MIN_BALANCE = 15;
const BILLING_INTERVAL = 10000; // 10 seconds
const COMMISSION_PERCENT = 20;

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
      const freshUser = await User.findById(userId);
      const freshSession = await ConsultSession.findById(session._id);

      if (!freshUser || !freshSession || freshSession.status !== "ACTIVE") {
        clearInterval(interval);
        sessions.delete(sessionIdStr);
        return;
      }

      const perSecondRate = freshSession.ratePerMinute / 60;
      const deduction = perSecondRate * 10;

      /* 🔴 AUTO FORCE END */
      if (freshUser.walletBalance <= deduction) {
        const remaining = freshUser.walletBalance;

        await WalletTransaction.create({
          userId,
          type: "DEBIT",
          amount: remaining,
          reason: "CONSULTATION",
          referenceId: freshSession._id.toString(),
          balanceAfter: 0,
        });

        freshUser.walletBalance = 0;
        freshSession.totalAmount += remaining;
        freshSession.status = "FORCE_ENDED";
        freshSession.endedAt = new Date();

        await freshUser.save();
        await freshSession.save();

        const commissionAmount = (freshSession.totalAmount * COMMISSION_PERCENT) / 100;
        const lawyerAmount = freshSession.totalAmount - commissionAmount;

        await LawyerEarning.create({
          sessionId: freshSession._id,
          lawyerId: freshSession.lawyerId,
          totalAmount: freshSession.totalAmount,
          commissionAmount,
          lawyerAmount,
        });

        io.to(room).emit("SESSION_FORCE_ENDED", {
          totalAmount: freshSession.totalAmount,
          remainingBalance: 0,
          commission: commissionAmount,
          lawyerEarning: lawyerAmount,
          reason: "INSUFFICIENT_BALANCE",
        });

        /* 🔓 RELEASE LOCKS */
        await releaseLock(`lock:lawyer:${freshSession.lawyerId}`);
        await releaseLock(`lock:user:${userId}`);

        clearInterval(interval);
        sessions.delete(sessionIdStr);
        return;
      }

      /* 🟢 NORMAL BILLING */
      freshUser.walletBalance -= deduction;
      freshSession.totalAmount += deduction;

      await freshUser.save();
      await freshSession.save();

      io.to(room).emit("SESSION_UPDATE", {
        totalAmount: freshSession.totalAmount,
        remainingBalance: freshUser.walletBalance,
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

    if (!session || session.status !== "ACTIVE") {
      return res.status(404).json({ message: "Active session not found" });
    }

    if (session.userId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
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

    const commissionAmount =
      (session.totalAmount * COMMISSION_PERCENT) / 100;

    const lawyerAmount =
      session.totalAmount - commissionAmount;

    await LawyerEarning.create({
      sessionId: session._id,
      lawyerId: session.lawyerId,
      totalAmount: session.totalAmount,
      commissionAmount,
      lawyerAmount,
    });

    /* 🔓 RELEASE LOCKS (THIS WAS MISSING BEFORE) */
    await releaseLock(lawyerLockKey);
    await releaseLock(userLockKey);

    const user = await User.findById(userId);

    io.to(room).emit("SESSION_ENDED", {
      totalAmount: session.totalAmount,
      remainingBalance: user.walletBalance,
      commission: commissionAmount,
      lawyerEarning: lawyerAmount,
    });

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

const recoverActiveSessions = async (io) => {
  try {
    console.log("🔄 Recovering active sessions...");
    const activeSessions = await ConsultSession.find({ status: "ACTIVE" });

    for (const session of activeSessions) {
      if (sessions.has(session._id.toString())) continue;

      console.log(`Resuming billing for session: ${session._id}`);

      const interval = setInterval(async () => {
        try {
          const freshUser = await User.findById(session.userId);
          const freshSession = await ConsultSession.findById(session._id);

          if (!freshUser || !freshSession || freshSession.status !== "ACTIVE") {
            clearInterval(interval);
            sessions.delete(session._id.toString());
            return;
          }

          const perSecondRate = freshSession.ratePerMinute / 60;
          const deduction = perSecondRate * 10;

          if (freshUser.walletBalance <= deduction) {
            const remaining = freshUser.walletBalance;

            await WalletTransaction.create({
              userId: session.userId,
              type: "DEBIT",
              amount: remaining,
              reason: "CONSULTATION",
              referenceId: freshSession._id.toString(),
              balanceAfter: 0,
            });

            freshUser.walletBalance = 0;
            freshSession.totalAmount += remaining;
            freshSession.status = "FORCE_ENDED";
            freshSession.endedAt = new Date();

            await freshUser.save();
            await freshSession.save();

            const commissionAmount =
              (freshSession.totalAmount * COMMISSION_PERCENT) / 100;
            const lawyerAmount = freshSession.totalAmount - commissionAmount;

            await LawyerEarning.create({
              sessionId: freshSession._id,
              lawyerId: freshSession.lawyerId,
              totalAmount: freshSession.totalAmount,
              commissionAmount,
              lawyerAmount,
            });

            io.to(`session:${session._id}`).emit("SESSION_FORCE_ENDED", {
              totalAmount: freshSession.totalAmount,
              remainingBalance: 0,
              commission: commissionAmount,
              lawyerEarning: lawyerAmount,
              reason: "INSUFFICIENT_BALANCE",
            });

            const lawyerLockKey = `lock:lawyer:${session.lawyerId}`;
            const userLockKey = `lock:user:${session.userId}`;
            await releaseLock(lawyerLockKey);
            await releaseLock(userLockKey);

            clearInterval(interval);
            sessions.delete(freshSession._id.toString());
            return;
          }

          freshUser.walletBalance -= deduction;
          freshSession.totalAmount += deduction;

          await freshUser.save();
          await freshSession.save();

          io.to(`session:${session._id}`).emit("SESSION_UPDATE", {
            totalAmount: freshSession.totalAmount,
            remainingBalance: freshUser.walletBalance,
          });

        } catch (err) {
          console.error(`Billing error for session ${session._id}:`, err);
        }
      }, BILLING_INTERVAL);

      sessions.set(session._id.toString(), interval);
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

module.exports = {
  startConsultation,
  acceptConsultation,
  declineConsultation,
  cancelConsultation,
  endConsultation,
  getConsultationSession,
  getLawyerConsultations,
  recoverActiveSessions,
};
