const Review = require("../modals/Review");
const ConsultSession = require("../modals/consultSession");
const Lawyer = require("../modals/Lawyer");

const createReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId, rating, comment } = req.body;

    if (!sessionId || !rating) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be 1 to 5" });
    }

    // 1️⃣ Check session
    const session = await ConsultSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.status !== "ENDED" && session.status !== "FORCE_ENDED") {
      console.log(`❌ REVIEW REJECTED: Session ${session._id} status is ${session.status}`);
      return res.status(400).json({
        message: "You can only review after session ends",
      });
    }

    if (session.userId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // 2️⃣ Check duplicate review
    const existingReview = await Review.findOne({ sessionId });

    if (existingReview) {
      return res.status(409).json({
        message: "Review already submitted for this session",
      });
    }

    // 3️⃣ Create review
    const review = await Review.create({
      sessionId,
      userId,
      lawyerId: session.lawyerId,
      rating,
      comment,
    });

    // 4️⃣ Update lawyer rating
    const lawyer = await Lawyer.findById(session.lawyerId);

    const totalReviews = lawyer.totalReviews || 0;
    const currentRating = lawyer.rating || 0;

    const newTotalReviews = totalReviews + 1;

    const newAverage =
      (currentRating * totalReviews + rating) / newTotalReviews;

    lawyer.rating = Number(newAverage.toFixed(2));
    lawyer.totalReviews = newTotalReviews;

    await lawyer.save();

    res.status(201).json({
      message: "Review submitted successfully",
      review,
    });

  } catch (error) {
    console.error("CREATE REVIEW ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};


const getLawyerReviews = async (req, res) => {
  try {
    const { lawyerId } = req.params;

    const reviews = await Review.find({ lawyerId })
      .populate("userId", "name profileImage")
      .sort({ createdAt: -1 });

    res.status(200).json({ reviews });
  } catch (error) {
    console.error("GET REVIEWS ERROR", error);
    res.status(500).json({ message: "Server error" });
  }
};




module.exports = { createReview, getLawyerReviews };

