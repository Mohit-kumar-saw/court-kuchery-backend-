const User = require("../modals/authModal");
const Lawyer = require("../modals/Lawyer");
const WalletTransaction = require("../modals/WalletTransaction");

/* GET WALLET BALANCE */
const getWalletBalance = async (req, res) => {
  try {
    const { id, role } = req.user;

    if (role === "LAWYER") {
      const lawyer = await Lawyer.findById(id);
      if (!lawyer) return res.status(404).json({ message: "Lawyer not found" });
      return res.status(200).json({
        balance: lawyer.availableBalance || 0,
        pending: lawyer.pendingBalance || 0
      });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      balance: user.walletBalance,
    });
  } catch (error) {
    console.error("WALLET BALANCE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* GET WALLET TRANSACTIONS */
const getWalletTransactions = async (req, res) => {
  try {
    const transactions = await WalletTransaction.find({
      userId: req.user.id,
    }).sort({ createdAt: -1 });

    res.status(200).json({ transactions });
  } catch (error) {
    console.error("WALLET TRANSACTIONS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const dummyRecharge = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(req.user.id);

    const newBalance = user.walletBalance + amount;

    await WalletTransaction.create({
      userId: user._id,
      type: "CREDIT",
      amount,
      reason: "RECHARGE",
      referenceId: "DUMMY_PAYMENT",
      balanceAfter: newBalance,
    });

    user.walletBalance = newBalance;
    await user.save();

    res.status(200).json({
      message: "Wallet recharged (dummy)",
      balance: newBalance,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getWalletBalance,
  getWalletTransactions,
  dummyRecharge
};
