const express = require("express");
const router = express.Router();
const { register, login, logout, refreshAccessToken, getProfile } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");


router.get("/me", authMiddleware, getProfile);
router.post("/register", register);
router.post("/login", login);
router.post("/logout", authMiddleware, logout);
router.post("/refresh", refreshAccessToken);

module.exports = router;
