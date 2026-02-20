const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  registerLawyer,
  getLawyers,
  getLawyerById,
  updateAvailability,
  verifyLawyer,
  lawyerLogin,
  refreshLawyerAccessToken,
  getLawyerProfile,
  getLawyerStats
} = require("../controllers/lawyerController");
const adminMiddleware = require("../middleware/adminMiddleware");

router.post("/register", registerLawyer);
router.get("/", getLawyers);
router.get("/:lawyerId", getLawyerById);
router.patch("/availability", authMiddleware, updateAvailability);
router.patch("/:lawyerId/verify", authMiddleware, adminMiddleware, verifyLawyer);
router.post("/login", lawyerLogin);
router.post("/refresh", refreshLawyerAccessToken);
router.get("/me", authMiddleware, getLawyerProfile);
router.get("/stats", authMiddleware, getLawyerStats);



module.exports = router;
