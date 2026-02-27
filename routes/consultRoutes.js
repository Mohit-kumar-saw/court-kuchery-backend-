const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
    startConsultation,
    acceptConsultation,
    declineConsultation,
    cancelConsultation,
    endConsultation,
    getConsultationSession,
    getLawyerConsultations,
    getUserConsultations,
    generateAgoraTokenForSession
} = require("../controllers/consultController");

router.post("/start", authMiddleware, startConsultation);
router.post("/accept/:sessionId", authMiddleware, acceptConsultation);
router.post("/decline/:sessionId", authMiddleware, declineConsultation);
router.post("/cancel/:sessionId", authMiddleware, cancelConsultation);
router.post("/:sessionId/end", authMiddleware, endConsultation);
router.get("/lawyer/all", authMiddleware, getLawyerConsultations);
router.get("/user/all", authMiddleware, getUserConsultations);
router.get("/:sessionId/agora-token", authMiddleware, generateAgoraTokenForSession);
router.get("/:sessionId", authMiddleware, getConsultationSession);


module.exports = router;
