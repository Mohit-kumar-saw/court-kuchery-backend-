const LawyerEarning = require("../modals/LawyerEarning");

const getLawyerEarnings = async (req, res) => {
    try {
      const lawyerId = req.user.id;
      const { page = 1, limit = 10, status } = req.query;
  
      const query = { lawyerId };
  
      if (status) {
        query.status = status;
      }
  
      const skip = (page - 1) * limit;
  
      const earnings = await LawyerEarning.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));
  
      const totalRecords = await LawyerEarning.countDocuments(query);
  
      /* ===============================
         🔥 ADVANCED SUMMARY
      =============================== */
  
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
  
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
  
      const summaryAgg = await LawyerEarning.aggregate([
        { $match: { lawyerId } },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$lawyerAmount" },
            totalCommission: { $sum: "$commissionAmount" },
            totalSessions: { $sum: 1 },
            pendingAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "PENDING"] }, "$lawyerAmount", 0],
              },
            },
            paidAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "PAID"] }, "$lawyerAmount", 0],
              },
            },
          },
        },
      ]);
  
      const todayAgg = await LawyerEarning.aggregate([
        {
          $match: {
            lawyerId,
            createdAt: { $gte: todayStart },
          },
        },
        {
          $group: {
            _id: null,
            todayEarnings: { $sum: "$lawyerAmount" },
          },
        },
      ]);
  
      const monthAgg = await LawyerEarning.aggregate([
        {
          $match: {
            lawyerId,
            createdAt: { $gte: monthStart },
          },
        },
        {
          $group: {
            _id: null,
            thisMonthEarnings: { $sum: "$lawyerAmount" },
          },
        },
      ]);
  
      res.status(200).json({
        totalRecords,
        page: Number(page),
        pages: Math.ceil(totalRecords / limit),
        earnings,
        summary: {
          ...(summaryAgg[0] || {
            totalEarnings: 0,
            totalCommission: 0,
            totalSessions: 0,
            pendingAmount: 0,
            paidAmount: 0,
          }),
          todayEarnings: todayAgg[0]?.todayEarnings || 0,
          thisMonthEarnings: monthAgg[0]?.thisMonthEarnings || 0,
        },
      });
  
    } catch (error) {
      console.error("GET LAWYER EARNINGS ERROR 👉", error);
      res.status(500).json({ message: "Server error" });
    }
  };
  

module.exports = { getLawyerEarnings };
