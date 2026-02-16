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
      status: "ACTIVE",
      totalAmount: 0,
    });

    const room = `session:${session._id}`;

    io.to(room).emit("SESSION_STARTED", {
      sessionId: session._id,
      ratePerMinute: lawyer.ratePerMinute,
      startedAt: session.startedAt,
    });

    /* 🔥 BILLING ENGINE */
    const interval = setInterval(async () => {
      try {
        const freshUser = await User.findById(userId);
        const freshSession = await ConsultSession.findById(session._id);

        if (!freshUser || !freshSession) {
          clearInterval(interval);
          sessions.delete(session._id.toString());
          return;
        }

        if (freshSession.status !== "ACTIVE") {
          clearInterval(interval);
          sessions.delete(session._id.toString());
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

          const commissionAmount =
            (freshSession.totalAmount * COMMISSION_PERCENT) / 100;

          const lawyerAmount =
            freshSession.totalAmount - commissionAmount;

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
          await releaseLock(lawyerLockKey);
          await releaseLock(userLockKey);

          clearInterval(interval);
          sessions.delete(freshSession._id.toString());

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

    sessions.set(session._id.toString(), interval);

    res.status(201).json({
      message: "Consultation started",
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

module.exports = {
  startConsultation,
  endConsultation,
  recoverActiveSessions,
};
