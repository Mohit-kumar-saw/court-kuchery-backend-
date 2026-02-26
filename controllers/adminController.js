const Lawyer = require("../modals/Lawyer");
const User = require("../modals/authModal");
const ConsultSession = require("../modals/consultSession");
const LawyerEarning = require("../modals/LawyerEarning");
const Review = require("../modals/Review");
const SystemSettings = require("../modals/SystemSettings");
const Payout = require("../modals/Payout");
const mongoose = require("mongoose");

/* GET ADMIN DASHBOARD STATS */
const getAdminDashboardStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: "USER" });
        const totalLawyers = await Lawyer.countDocuments();
        const pendingVerifications = await Lawyer.countDocuments({ isVerified: false });
        const activeSessions = await ConsultSession.countDocuments({ status: "ACTIVE" });
        const totalConsultations = await ConsultSession.countDocuments();
        const endedConsultations = await ConsultSession.countDocuments({ status: "ENDED" });
        const pendingConsultations = await ConsultSession.countDocuments({ status: "REQUESTED" });
        const forceEndedConsultations = await ConsultSession.countDocuments({ status: "FORCE_ENDED" });

        const pendingReleaseCount = await LawyerEarning.countDocuments({ status: "PENDING" });
        const pendingReleaseAmountRaw = await LawyerEarning.aggregate([
            { $match: { status: "PENDING" } },
            { $group: { _id: null, total: { $sum: "$lawyerAmount" } } }
        ]);
        const pendingReleaseAmount = pendingReleaseAmountRaw[0]?.total || 0;

        const totalEarning = await LawyerEarning.aggregate([
            { $group: { _id: null, total: { $sum: "$commissionAmount" } } }
        ]);

        // 5. Earnings by Day (Last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const earningsByDay = await LawyerEarning.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    total: { $sum: "$commissionAmount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 6. Trending Lawyers (Top 5 by Rating/Reviews)
        const trendingLawyers = await Lawyer.find({ isVerified: true })
            .sort({ rating: -1, totalReviews: -1 })
            .limit(5)
            .select("name specialization rating totalReviews");

        // 7. Recent Activity (Latest 5 consultations and 5 new lawyers)
        const recentConsults = await ConsultSession.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate("userId", "name")
            .populate("lawyerId", "name");

        const newLawyers = await Lawyer.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select("name specialization createdAt");

        const recentActivity = [
            ...recentConsults.map(c => ({
                id: c._id,
                type: "CONSULTATION",
                title: "New Consultation",
                description: `${c.userId?.name || 'User'} with ${c.lawyerId?.name || 'Lawyer'}`,
                time: c.createdAt,
                status: c.status
            })),
            ...newLawyers.map(l => ({
                id: l._id,
                type: "REGISTRATION",
                title: "Lawyer Registered",
                description: `${l.name} (${l.specialization?.[0]}) joined`,
                time: l.createdAt
            }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);

        // 8. Specialization Distribution
        const specializationStats = await Lawyer.aggregate([
            { $unwind: "$specialization" },
            { $group: { _id: "$specialization", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                totalLawyers,
                pendingVerifications,
                activeSessions,
                totalConsultations,
                endedConsultations,
                pendingConsultations,
                forceEndedConsultations,
                totalPlatformEarning: totalEarning[0]?.total || 0,
                earningsByDay,
                trendingLawyers,
                recentActivity,
                specializationStats,
                pendingReleaseCount,
                pendingReleaseAmount
            }
        });
    } catch (error) {
        console.error("ADMIN STATS ERROR 👉", error);
        res.status(500).json({ message: "Server error" });
    }
};

/* LAWYER MANAGEMENT */
const getAllLawyersAdmin = async (req, res) => {
    try {
        const lawyers = await Lawyer.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, lawyers });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const toggleLawyerBlock = async (req, res) => {
    try {
        const { lawyerId } = req.params;
        const lawyer = await Lawyer.findById(lawyerId);
        if (!lawyer) return res.status(404).json({ message: "Lawyer not found" });

        lawyer.isBlocked = !lawyer.isBlocked;
        await lawyer.save();

        res.status(200).json({ success: true, isBlocked: lawyer.isBlocked });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

/* USER MANAGEMENT */
const getAllUsersAdmin = async (req, res) => {
    try {
        const users = await User.find({ role: "USER" }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, users });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const toggleUserBlock = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.isBlocked = !user.isBlocked;
        await user.save();

        res.status(200).json({ success: true, isBlocked: user.isBlocked });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

/* CONSULTATION MONITORING */
const getAllConsultationsAdmin = async (req, res) => {
    try {
        const sessions = await ConsultSession.find()
            .populate("userId", "name email")
            .populate("lawyerId", "name email")
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, sessions });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

/* REVENUE ANALYTICS */
const getRevenueStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateMatch = {};

        if (startDate || endDate) {
            dateMatch.createdAt = {};
            if (startDate) dateMatch.createdAt.$gte = new Date(startDate);
            if (endDate) dateMatch.createdAt.$lte = new Date(endDate + 'T23:59:59');
        }

        // 1. Summary Metrics from Earnings
        const totals = await LawyerEarning.aggregate([
            { $match: dateMatch },
            {
                $group: {
                    _id: null,
                    totalPlatformEarning: { $sum: "$commissionAmount" },
                    totalTransactionVolume: { $sum: "$totalAmount" },
                    totalLawyerEarnings: { $sum: "$lawyerAmount" }
                }
            }
        ]);

        const summaryEarnings = totals[0] || {
            totalPlatformEarning: 0,
            totalTransactionVolume: 0,
            totalLawyerEarnings: 0
        };

        // Summary Metrics from Payouts
        const payoutTotals = await Payout.aggregate([
            { $match: dateMatch },
            {
                $group: {
                    _id: null,
                    pendingPayouts: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "PENDING"] }, "$amount", 0]
                        }
                    },
                    paidPayouts: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "PAID"] }, "$amount", 0]
                        }
                    }
                }
            }
        ]);

        const summaryPayouts = payoutTotals[0] || {
            pendingPayouts: 0,
            paidPayouts: 0
        };

        const summary = {
            ...summaryEarnings,
            ...summaryPayouts
        };

        // 2. Revenue Over Time (Daily)
        let chartMatch = { ...dateMatch };
        if (!startDate && !endDate) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            chartMatch.createdAt = { $gte: thirtyDaysAgo };
        }

        const revenueOverTime = await LawyerEarning.aggregate([
            { $match: chartMatch },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$commissionAmount" },
                    volume: { $sum: "$totalAmount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 3. Payout Status Distribution
        const payoutDistribution = await Payout.aggregate([
            { $match: dateMatch },
            { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } }
        ]);

        // 4. Top Revenue Generating Lawyers
        const topLawyers = await LawyerEarning.aggregate([
            { $match: dateMatch },
            {
                $group: {
                    _id: "$lawyerId",
                    totalRevenue: { $sum: "$commissionAmount" },
                    totalVolume: { $sum: "$totalAmount" },
                    sessionsCount: { $sum: 1 }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "lawyers",
                    localField: "_id",
                    foreignField: "_id",
                    as: "lawyerInfo"
                }
            },
            { $unwind: "$lawyerInfo" },
            {
                $project: {
                    name: "$lawyerInfo.name",
                    email: "$lawyerInfo.email",
                    totalRevenue: 1,
                    totalVolume: 1,
                    sessionsCount: 1
                }
            }
        ]);

        // 5. Recent Financial Transactions
        const recentTransactions = await LawyerEarning.find()
            .sort({ createdAt: -1 })
            .limit(20)
            .populate({
                path: "sessionId",
                select: "type status"
            })
            .populate("lawyerId", "name");

        res.status(200).json({
            success: true,
            revenue: {
                summary,
                revenueOverTime,
                payoutDistribution,
                topLawyers,
                recentTransactions
            }
        });
    } catch (error) {
        console.error("REVENUE STATS ERROR 👉", error);
        res.status(500).json({ message: "Server error" });
    }
};

/* PAYOUT MANAGEMENT */
const getAllPayoutsAdmin = async (req, res) => {
    try {
        const payouts = await Payout.find()
            .populate("lawyerId", "name email")
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, payouts });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const updatePayoutStatus = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { status, razorpayPayoutId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(payoutId)) {
            return res.status(400).json({ message: "Invalid payout ID" });
        }

        if (!['PENDING', 'PAID', 'FAILED'].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const payout = await Payout.findById(payoutId);
        if (!payout) return res.status(404).json({ message: "Payout record not found" });

        // Update status
        payout.status = status;
        if (status === 'PAID') {
            payout.paidAt = new Date();
            if (razorpayPayoutId) payout.razorpayPayoutId = razorpayPayoutId;
        }

        // If FAILED, we should ideally refund the availableBalance to the lawyer
        if (status === 'FAILED' && payout.status !== 'FAILED') {
            await Lawyer.findByIdAndUpdate(payout.lawyerId, {
                $inc: { availableBalance: payout.amount }
            });
            // Also record a reversal transaction
            await WalletTransaction.create({
                userId: payout.lawyerId,
                type: "CREDIT",
                amount: payout.amount,
                reason: "REFUND",
                referenceId: `PAYOUT_FAILED:${payout._id}`,
                balanceAfter: 0 // Placeholder, we should fetch actual balance if we need balanceAfter accuracy
            });
        }

        await payout.save();
        res.status(200).json({ success: true, payout });
    } catch (error) {
        console.error("UPDATE PAYOUT ERROR 👉", error);
        res.status(500).json({ message: "Server error" });
    }
};

/* REVIEW MODERATION */
const getAllReviewsAdmin = async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate("userId", "name email")
            .populate("lawyerId", "name email")
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, reviews });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteReviewAdmin = async (req, res) => {
    try {
        const { reviewId } = req.params;
        await Review.findByIdAndDelete(reviewId);
        res.status(200).json({ success: true, message: "Review deleted" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

/* SYSTEM SETTINGS */
const getSystemSettings = async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create({});
        }
        res.status(200).json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const updateSystemSettings = async (req, res) => {
    try {
        const updates = req.body;
        let settings = await SystemSettings.findOne();

        if (!settings) {
            settings = new SystemSettings(updates);
        } else {
            Object.assign(settings, updates);
        }

        await settings.save();
        res.status(200).json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

/* EARNING RELEASE MANAGEMENT */
const getUnreleasedEarnings = async (req, res) => {
    try {
        const earnings = await LawyerEarning.find({ status: "PENDING" })
            .populate("lawyerId", "name email")
            .populate({
                path: "sessionId",
                select: "type status startedAt endedAt"
            })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, earnings });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const releaseLawyerEarning = async (req, res) => {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();
    try {
        const { earningId } = req.params;

        const earning = await LawyerEarning.findById(earningId).session(mongoSession);
        if (!earning) {
            await mongoSession.abortTransaction();
            return res.status(404).json({ message: "Earning record not found" });
        }

        if (earning.status !== "PENDING") {
            await mongoSession.abortTransaction();
            return res.status(400).json({ message: `Earning is already ${earning.status}` });
        }

        // 1. Update Earning status
        earning.status = "RELEASED";
        await earning.save({ session: mongoSession });

        // 2. Move funds from pending to available
        const updatedLawyer = await Lawyer.findByIdAndUpdate(
            earning.lawyerId,
            {
                $inc: {
                    pendingBalance: -earning.lawyerAmount,
                    availableBalance: earning.lawyerAmount,
                    totalEarnings: earning.lawyerAmount
                }
            },
            { session: mongoSession, new: true }
        );

        if (!updatedLawyer) {
            throw new Error("Lawyer not found during fund release");
        }

        await mongoSession.commitTransaction();
        res.status(200).json({ success: true, message: "Earning released successfully" });
    } catch (error) {
        await mongoSession.abortTransaction();
        console.error("RELEASE EARNING ERROR 👉", error);
        res.status(500).json({ message: "Server error" });
    } finally {
        mongoSession.endSession();
    }
};

const getAllEarningsAdmin = async (req, res) => {
    try {
        const earnings = await LawyerEarning.find()
            .populate("lawyerId", "name email")
            .populate({
                path: "sessionId",
                select: "type status startedAt endedAt"
            })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, earnings });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    getAdminDashboardStats,
    getAllLawyersAdmin,
    toggleLawyerBlock,
    getAllUsersAdmin,
    toggleUserBlock,
    getAllConsultationsAdmin,
    getRevenueStats,
    getAllPayoutsAdmin,
    updatePayoutStatus,
    getAllReviewsAdmin,
    deleteReviewAdmin,
    getSystemSettings,
    updateSystemSettings,
    getUnreleasedEarnings,
    releaseLawyerEarning,
    getAllEarningsAdmin,
};
