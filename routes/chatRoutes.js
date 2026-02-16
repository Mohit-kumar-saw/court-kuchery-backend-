const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getSessionMessages } = require("../controllers/chatController");

router.get("/:sessionId", authMiddleware, getSessionMessages);

module.exports = router;
