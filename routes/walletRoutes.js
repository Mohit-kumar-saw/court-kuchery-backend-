const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getWalletBalance,
  getWalletTransactions,
  dummyRecharge
} = require("../controllers/walletController");

router.get("/balance", authMiddleware, getWalletBalance);
router.get("/transactions", authMiddleware, getWalletTransactions);
router.post("/recharge", authMiddleware, dummyRecharge);


module.exports = router;
