
const bcrypt = require("bcryptjs");
const User = require("../modals/authModal");
const { generateAccessToken, generateRefreshToken,  verifyRefreshToken} = require("../utils/jwt");



const register = async (req, res) => {
  try {
    const { name, email, password , phone} = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
    });

    const accessToken = generateAccessToken({
      id: user._id,
      role: user.role,
    });
    
    const refreshToken = generateRefreshToken({
      id: user._id,
      role: user.role,
    });
    

    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("REGISTER ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};


const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = generateAccessToken({
      id: user._id,
      role: user.role,
    });
    
    const refreshToken = generateRefreshToken({
      id: user._id,
      role: user.role,
    });
    

    user.refreshToken = refreshToken;
    user.lastLoginAt = new Date();
    await user.save();

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("LOGIN ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};



const logout = async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
    });

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("LOGOUT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};


const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // verify refresh token signature
    const decoded = verifyRefreshToken(refreshToken);

    // check token exists in DB
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // issue new access token
    const newAccessToken = generateAccessToken({
      id: user._id,
      role: user.role,
    });

    res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};


module.exports = { register, login ,logout, refreshAccessToken};
