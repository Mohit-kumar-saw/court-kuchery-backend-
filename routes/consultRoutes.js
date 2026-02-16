const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { startConsultation, endConsultation } = require("../controllers/consultController");

router.post("/start", authMiddleware, startConsultation);
router.post("/:sessionId/end", authMiddleware, endConsultation);


module.exports = router;
