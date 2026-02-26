require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");

const connectDB = require("./utils/db");
const initializeSocket = require("./socket/socket");

const authRoutes = require("./routes/authRoutes");
const walletRoutes = require("./routes/walletRoutes");
const lawyerRoutes = require("./routes/lawyerRoutes");
const consultRoutes = require("./routes/consultRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const lawyerEarningRoutes = require("./routes/lawyerEarningRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminRoutes = require("./routes/adminRoutes");


connectDB();

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/health", (req, res) => {
  res.send("server is running....")
})

app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/lawyer", lawyerRoutes);
app.use("/consult", consultRoutes);
app.use("/reviews", reviewRoutes);
app.use("/api/lawyer/earnings", lawyerEarningRoutes);
app.use("/chat", chatRoutes);
app.use("/admin", adminRoutes);

// 🔥 Initialize Socket Layer
initializeSocket(server, app);

// ♻️ Recover Active Sessions (in case of restart)
const { recoverActiveSessions } = require("./controllers/consultController");
// Wait a bit for DB connection or handle inside recover function better
// best to call it when DB is ready, but here is fine if DB connects fast
setTimeout(() => {
  if (app.get("io")) {
    recoverActiveSessions(app.get("io"));
  }
}, 5000);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
