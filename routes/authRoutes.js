const express = require("express");
const router = express.Router();
const { register, login, logout, refreshAccessToken, getProfile } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/logout", authMiddleware, logout);
router.post("/refresh", refreshAccessToken);
router.get("/me", authMiddleware, getProfile);

module.exports = router;
