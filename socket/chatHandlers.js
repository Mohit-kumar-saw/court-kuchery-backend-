const Message = require("../modals/Message");
const ConsultSession = require("../modals/consultSession");

module.exports = (io, socket) => {

  /* ============================
     JOIN SESSION
  ============================ */
  socket.on("JOIN_SESSION", ({ sessionId }) => {
    if (!sessionId) return;
    const room = `session:${sessionId}`;
    socket.join(room);
    console.log(`📌 Socket ${socket.id} (${socket.user.role}) joined room: ${room}`);
  });


  /* ============================
     SEND MESSAGE
  ============================ */
  socket.on("SEND_MESSAGE", async (data) => {
    try {
      const { sessionId, content } = data;
      if (!sessionId || !content) return;

      const role = (socket.user.role || "user").toUpperCase(); // Ensure "USER" or "LAWYER"

      console.log(`📩 Message from ${socket.user.id} [${role}]: ${content}`);

      const newMessage = await Message.create({
        sessionId,
        senderId: socket.user.id,
        senderRole: role,
        messageType: "TEXT",
        content,
        status: "SENT",
      });

      const room = `session:${sessionId}`;
      console.log(`✅ Message saved. Emitting to ${room}`);

      io.to(room).emit("RECEIVE_MESSAGE", {
        _id: newMessage._id,
        sessionId,
        content,
        senderRole: role,
        createdAt: newMessage.createdAt,
      });

    } catch (err) {
      console.error("❌ SEND_MESSAGE Error:", err);
    }
  });


  /* ============================
     LEAVE SESSION
  ============================ */
  socket.on("LEAVE_SESSION", ({ sessionId }) => {
    if (!sessionId) return;

    const room = `session:${sessionId}`;

    socket.leave(room);
    console.log(`🚪 Left session room: ${room}`);
  });

};
