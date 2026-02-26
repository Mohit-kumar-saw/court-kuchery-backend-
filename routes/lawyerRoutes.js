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
  getLawyerStats,
  withdrawFunds,
  completeLawyerProfile
} = require("../controllers/lawyerController");
const adminMiddleware = require("../middleware/adminMiddleware");

router.post("/register", registerLawyer);
router.get("/me", authMiddleware, getLawyerProfile);
router.get("/stats", authMiddleware, getLawyerStats);
router.get("/", getLawyers);
router.get("/:lawyerId", getLawyerById);
router.patch("/availability", authMiddleware, updateAvailability);
router.patch("/:lawyerId/verify", authMiddleware, adminMiddleware, verifyLawyer);
router.post("/login", lawyerLogin);
router.post("/refresh", refreshLawyerAccessToken);
router.post("/withdraw", authMiddleware, withdrawFunds);
router.post("/complete-profile", authMiddleware, completeLawyerProfile);



module.exports = router;
