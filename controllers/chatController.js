const Message = require("../modals/Message");
const ConsultSession = require("../modals/consultSession");

const getSessionMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID required" });
    }

    /* ============================
       1️⃣ Check session exists
    ============================ */
    const session = await ConsultSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    /* ============================
       2️⃣ Authorization check
    ============================ */
    if (
      session.userId.toString() !== userId &&
      session.lawyerId.toString() !== userId
    ) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    /* ============================
       3️⃣ Pagination logic
    ============================ */
    const skip = (page - 1) * limit;

    const messages = await Message.find({ sessionId })
      .sort({ createdAt: 1 }) // oldest first (correct for chat UI)
      .skip(skip)
      .limit(limit)
      .lean(); // performance boost

    const total = await Message.countDocuments({ sessionId });

    res.status(200).json({
      success: true,
      sessionStatus: session.status,
      totalMessages: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      messages,
    });

  } catch (error) {
    console.error("GET MESSAGES ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getSessionMessages };
