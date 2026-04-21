const bcrypt = require("bcryptjs");
const Lawyer = require("../modals/Lawyer");

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require("../utils/jwt");
const Payout = require("../modals/Payout");
const WalletTransaction = require("../modals/WalletTransaction");
const mongoose = require("mongoose");
const { acquireLock, releaseLock } = require("../utils/lock");


/* REGISTER LAWYER */
const registerLawyer = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existing = await Lawyer.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Lawyer already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const lawyer = await Lawyer.create({
      name,
      email,
      phone,
      password: hashedPassword,
      isVerified: false, // Default
      profileCompleted: false,
    });

    const accessToken = generateAccessToken({
      id: lawyer._id,
      role: "LAWYER",
    });

    const refreshToken = generateRefreshToken({
      id: lawyer._id,
      role: "LAWYER",
    });

    lawyer.refreshToken = refreshToken;
    await lawyer.save();

    res.status(201).json({
      message: "Lawyer registered. Please complete your profile.",
      lawyer: {
        id: lawyer._id,
        name: lawyer.name,
        email: lawyer.email,
        profileCompleted: lawyer.profileCompleted,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("REGISTER LAWYER ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* GET LAWYER PROFILE */
const getLawyerById = async (req, res) => {
  try {
    const lawyer = await Lawyer.findById(req.params.lawyerId).select(
      "-password"
    );

    if (!lawyer || !lawyer.isVerified) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({ lawyer });
  } catch (error) {
    res.status(500).json({ message: "Server errorrrr" });
  }
};

/* UPDATE AVAILABILITY */
const updateAvailability = async (req, res) => {
  try {
    const { isOnline } = req.body;

    await Lawyer.findByIdAndUpdate(req.user.id, { isOnline });

    res.status(200).json({ message: "Availability updated" });
  } catch (error) {
    console.log(error);

    res.status(500).json({ message: "Server error" });
  }
};

const verifyLawyer = async (req, res) => {

  try {
    const { lawyerId } = req.params;

    const lawyer = await Lawyer.findByIdAndUpdate(
      lawyerId,
      { isVerified: true },
      { new: true }
    );

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({
      message: "Lawyer verified successfully",
      lawyerId: lawyer._id,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({ message: "Server error" });
  }
};

const lawyerLogin = async (req, res) => {
  console.log("login-lawyer");
  try {
    const { email, password } = req.body;
    console.log(email, password);


    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const lawyer = await Lawyer.findOne({ email }).select("+password");

    console.log(lawyer);

    if (!lawyer) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // if (!lawyer.isVerified) {
    //   return res
    //     .status(403)
    //     .json({ message: "Lawyer not verified yet" });
    // }

    if (lawyer.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    const isMatch = await bcrypt.compare(password, lawyer.password);
    console.log(isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken({
      id: lawyer._id,
      role: "LAWYER",
    });

    const refreshToken = generateRefreshToken({
      id: lawyer._id,
      role: "LAWYER",
    });

    lawyer.refreshToken = refreshToken;
    lawyer.isOnline = true; // Auto set online on login
    await lawyer.save();

    res.status(200).json({
      message: "Lawyer login successful",
      lawyer: {
        id: lawyer._id,
        name: lawyer.name,
        email: lawyer.email,
        profileCompleted: lawyer.profileCompleted,
        isOnline: lawyer.isOnline,
        courtType: lawyer.courtType,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("LAWYER LOGIN ERROR 👉", error);
    res.status(500).json({ message: error.message });
  }
};

const lawyerLogout = async (req, res) => {
  try {
    const lawyerId = req.user.id;

    await Lawyer.findByIdAndUpdate(lawyerId, {
      refreshToken: null,
      isOnline: false, // Auto set offline on logout
    });

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("LAWYER LOGOUT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getLawyers = async (req, res) => {
  try {
    const {
      specialization,
      sort,
      page = 1,
      limit = 10,
      minPrice,
      maxPrice,
      onlineOnly,
      courtType,
      latitude,
      longitude,
      district,
      state,
    } = req.query;

    let lawyers = [];
    let total = 0;
    const skip = (Number(page) - 1) * Number(limit);

    const getAggregation = (matchQuery, nearCoords = null) => {
      const p = [];
      if (nearCoords) {
        p.push({
          $geoNear: {
            near: { type: "Point", coordinates: nearCoords },
            distanceField: "distance",
            spherical: true,
            query: { isVerified: true, ...matchQuery },
            distanceMultiplier: 0.001,
          },
        });
      } else {
        p.push({ $match: { isVerified: true, ...matchQuery } });
      }

      // Add common filters
      const filterMatch = {};
      if (specialization) filterMatch.specialization = specialization;
      if (courtType) filterMatch.courtType = { $in: courtType.split(",") };
      if (minPrice || maxPrice) {
        filterMatch.ratePerMinute = {};
        if (minPrice) filterMatch.ratePerMinute.$gte = Number(minPrice);
        if (maxPrice) filterMatch.ratePerMinute.$lte = Number(maxPrice);
      }
      if (onlineOnly === "true") filterMatch.isOnline = true;
      if (Object.keys(filterMatch).length > 0) p.push({ $match: filterMatch });

      // Default sort for non-proximity
      if (!nearCoords) {
        let sortOption = { rating: -1, createdAt: -1 };
        if (sort === "price_low") sortOption = { ratePerMinute: 1 };
        else if (sort === "price_high") sortOption = { ratePerMinute: -1 };
        else if (sort === "experience") sortOption = { experienceYears: -1 };
        p.push({ $sort: sortOption });
      }

      return p;
    };

    // TIER 1: Proximity
    if (latitude && longitude) {
      const p = getAggregation({}, [parseFloat(longitude), parseFloat(latitude)]);
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      if (lawyers.length > 0) {
        const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
        total = countRes[0]?.total || 0;
      }
    }

    // TIER 2: District
    if (lawyers.length === 0 && district) {
      const p = getAggregation({ district });
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      if (lawyers.length > 0) {
        const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
        total = countRes[0]?.total || 0;
      }
    }

    // TIER 3: State
    if (lawyers.length === 0 && state) {
      const p = getAggregation({ state });
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      if (lawyers.length > 0) {
        const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
        total = countRes[0]?.total || 0;
      }
    }

    // FINAL FALLBACK: All verified (if still nothing found)
    if (lawyers.length === 0) {
      const p = getAggregation({});
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
      total = countRes[0]?.total || 0;
    }

    res.status(200).json({
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      lawyers,
    });


  } catch (error) {
    console.error("GET LAWYERS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const refreshLawyerAccessToken = async (req, res) => {

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // verify refresh token signature
    const decoded = verifyRefreshToken(refreshToken);

    // check token exists in DB
    const user = await Lawyer.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // issue new access token
    const newAccessToken = generateAccessToken({
      id: user._id,
      role: "LAWYER",
    });

    res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.log(error);

    return res.status(401).json({ message: "Invalid or expired refresh token" }, error);

  }
};


const getLawyerProfile = async (req, res) => {
  console.log("/meeee called ");

  try {
    const lawyer = await Lawyer.findById(req.user.id).select("-password");
    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }
    res.status(200).json({ success: true, lawyer });
  } catch (error) {
    res.status(500).json({ message: "Server errorrrr", error });
    console.log(error);

  }
};

const getLawyerStats = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const ConsultSession = require("../modals/consultSession");

    const lawyer = await Lawyer.findById(lawyerId);
    if (!lawyer) return res.status(404).json({ message: "Lawyer not found" });

    // 1. Withdrawal Stats
    const payoutStats = await Payout.aggregate([
      { $match: { lawyerId: new mongoose.Types.ObjectId(lawyerId), status: "PAID" } },
      { $group: { _id: null, totalPaid: { $sum: "$amount" } } }
    ]);

    const totalPaidToBank = payoutStats[0]?.totalPaid || 0;

    // 2. Total Consultations
    const consultCount = await ConsultSession.countDocuments({ lawyerId });

    // 3. Total Clients
    const clientCount = (await ConsultSession.distinct("userId", { lawyerId })).length;

    res.status(200).json({
      success: true,
      stats: {
        totalEarnings: lawyer.totalEarnings || 0,
        availableBalance: lawyer.availableBalance || 0,
        pendingBalance: lawyer.pendingBalance || 0,
        paidToBank: totalPaidToBank,
        totalConsultations: consultCount,
        totalClients: clientCount
      }
    });
  } catch (error) {
    console.error("GET LAWYER STATS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* WITHDRAW FUNDS */
const withdrawFunds = async (req, res) => {
  const lawyerId = req.user.id;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "Invalid withdrawal amount" });
  }

  const lockKey = `withdraw_lock:${lawyerId}`;
  const hasLock = await acquireLock(lockKey, 30);
  if (!hasLock) {
    return res.status(429).json({ message: "Withdrawal in progress. Please wait." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const lawyer = await Lawyer.findById(lawyerId).session(session);

    if (lawyer.availableBalance < amount) {
      await session.abortTransaction();
      await releaseLock(lockKey);
      return res.status(400).json({ message: "Insufficient available balance" });
    }

    // 1. Decrement available balance
    lawyer.availableBalance -= amount;
    await lawyer.save({ session });

    // 2. Create withdrawal record (LEDGER)
    await WalletTransaction.create([{
      userId: lawyerId, // In this context, userId is the lawyer
      type: "DEBIT",
      amount,
      reason: "LAWYER_WITHDRAWAL",
      balanceAfter: lawyer.availableBalance,
      referenceId: "WITHDRAWAL_PENDING"
    }], { session });

    // 3. Create Payout record (Automated/Immediate)
    const isDummy = process.env.PAYMENT_MODE === "DUMMY";
    const payoutStatus = isDummy ? "PAID" : "PENDING";
    const paidAt = isDummy ? new Date() : null;

    const payout = await Payout.create([{
      lawyerId,
      amount,
      status: payoutStatus,
      paidAt
    }], { session });

    await session.commitTransaction();
    await releaseLock(lockKey);

    res.status(200).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      payout: payout[0]
    });

  } catch (error) {
    await session.abortTransaction();
    await releaseLock(lockKey);
    console.error("WITHDRAWAL ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    session.endSession();
  }
};

const completeLawyerProfile = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const { specialization, ratePerMinute, experienceYears, bio, barCouncilId, bankDetails, courtType, location, address, district, state } = req.body;

    if (!specialization || !ratePerMinute || !experienceYears || !barCouncilId || !bankDetails) {
      return res.status(400).json({ message: "All professional and bank details are required" });
    }

    const lawyer = await Lawyer.findByIdAndUpdate(
      lawyerId,
      {
        specialization,
        ratePerMinute,
        experienceYears,
        bio,
        barCouncilId,
        bankDetails,
        courtType,
        profileCompleted: true,
        location,
        address,
        district,
        state,
      },
      { new: true }
    );

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      lawyer: {
        id: lawyer._id,
        profileCompleted: lawyer.profileCompleted,
      }
    });
  } catch (error) {
    console.error("COMPLETE PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateLawyerProfile = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const { name, bio, specialization, ratePerMinute, experienceYears, phone, courtType, location, address, district, state } = req.body;

    const lawyer = await Lawyer.findByIdAndUpdate(
      lawyerId,
      {
        name,
        bio,
        specialization,
        ratePerMinute,
        experienceYears,
        courtType,
        location,
        address,
        district,
        state,
      },
      { new: true }
    );

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      lawyer: {
        id: lawyer._id,
        name: lawyer.name,
        email: lawyer.email,
        phone: lawyer.phone,
        specialization: lawyer.specialization,
        ratePerMinute: lawyer.ratePerMinute,
        experienceYears: lawyer.experienceYears,
        bio: lawyer.bio,
        courtType: lawyer.courtType,
        location: lawyer.location,
        address: lawyer.address,
        district: lawyer.district,
        state: lawyer.state,
      },
    });
  } catch (error) {
    console.error("UPDATE LAWYER PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  registerLawyer,
  getLawyers,
  getLawyerById,
  updateAvailability,
  verifyLawyer,
  lawyerLogin,
  lawyerLogout,
  refreshLawyerAccessToken,
  getLawyerProfile,
  getLawyerStats,
  withdrawFunds,
  completeLawyerProfile,
  updateLawyerProfile,
};

