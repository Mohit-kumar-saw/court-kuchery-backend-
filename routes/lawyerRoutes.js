const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  registerLawyer,
  getLawyers,
  getLawyerById,
  updateAvailability,
  verifyLawyer,
  lawyerLogin
} = require("../controllers/lawyerController");
const adminMiddleware = require("../middleware/adminMiddleware");
const { refreshLawyerAccessToken } = require("../controllers/lawyerController");

router.post("/register", registerLawyer);
router.get("/", getLawyers);
router.get("/:lawyerId", getLawyerById);
router.patch("/availability", authMiddleware, updateAvailability);
router.patch("/:lawyerId/verify",authMiddleware,adminMiddleware, verifyLawyer);
router.post("/login", lawyerLogin);
router.post("/refresh", refreshLawyerAccessToken);



module.exports = router;
