const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { getLawyerEarnings } = require("../controllers/lawyerEarningController");

router.get("/", authMiddleware, getLawyerEarnings);

module.exports = router;
