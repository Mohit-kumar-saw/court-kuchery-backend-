const bcrypt = require("bcryptjs");
const Lawyer = require("../modals/Lawyer");

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require("../utils/jwt");


/* REGISTER LAWYER */
const registerLawyer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      specialization,
      ratePerMinute,
      experienceYears,
      bio,
    } = req.body;

    if (!name || !email || !password || !specialization || !ratePerMinute) {
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
      specialization,
      ratePerMinute,
      experienceYears,
      bio,
    });

    res.status(201).json({
      message: "Lawyer registered. Awaiting verification.",
      lawyerId: lawyer._id,
    });
  } catch (error) {
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
    res.status(500).json({ message: "Server error" });
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

    if (!lawyer.isVerified) {
      return res
        .status(403)
        .json({ message: "Lawyer not verified yet" });
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
    await lawyer.save();

    res.status(200).json({
      message: "Lawyer login successful",
      lawyer: {
        id: lawyer._id,
        name: lawyer.name,
        email: lawyer.email,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("LAWYER LOGIN ERROR 👉", error);
    res.status(500).json({ message: error.message });
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
      onlineOnly
    } = req.query;

    const query = {
      isVerified: true,
    };

    // 🔹 Filter by specialization
    if (specialization) {
      query.specialization = specialization;
    }

    // 🔹 Filter by price range
    if (minPrice || maxPrice) {
      query.ratePerMinute = {};
      if (minPrice) query.ratePerMinute.$gte = Number(minPrice);
      if (maxPrice) query.ratePerMinute.$lte = Number(maxPrice);
    }

    // 🔹 Online filter
    if (onlineOnly === "true") {
      query.isOnline = true;
    }

    // 🔹 Sorting options
    let sortOption = {};

    switch (sort) {
      case "rating":
        sortOption = { rating: -1 };
        break;
      case "price_low":
        sortOption = { ratePerMinute: 1 };
        break;
      case "price_high":
        sortOption = { ratePerMinute: -1 };
        break;
      case "experience":
        sortOption = { experienceYears: -1 };
        break;
      case "reviews":
        sortOption = { totalReviews: -1 };
        break;
      default:
        sortOption = { createdAt: -1 }; // newest first
    }

    const skip = (page - 1) * limit;

    const lawyers = await Lawyer.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .select("-password -refreshToken");

    const total = await Lawyer.countDocuments(query);

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
  try {
    const lawyer = await Lawyer.findById(req.user.id).select("-password");
    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }
    res.status(200).json({ success: true, lawyer });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getLawyerStats = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const LawyerEarning = require("../modals/LawyerEarning");
    const ConsultSession = require("../modals/consultSession");

    // 1. Total Earnings
    const earnings = await LawyerEarning.aggregate([
      { $match: { lawyerId: new (require("mongoose")).Types.ObjectId(lawyerId) } },
      { $group: { _id: null, total: { $sum: "$lawyerAmount" } } }
    ]);

    // 2. Total Consultations
    const consultCount = await ConsultSession.countDocuments({ lawyerId });

    // 3. Total Clients (Unique User IDs)
    const clientCount = (await ConsultSession.distinct("userId", { lawyerId })).length;

    res.status(200).json({
      success: true,
      stats: {
        totalEarnings: earnings[0]?.total || 0,
        totalConsultations: consultCount,
        totalClients: clientCount
      }
    });
  } catch (error) {
    console.error("GET LAWYER STATS ERROR 👉", error);
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
  refreshLawyerAccessToken,
  getLawyerProfile,
  getLawyerStats
};

