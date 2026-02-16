const Message = require("../modals/Message");
const ConsultSession = require("../modals/consultSession");

module.exports = (io, socket) => {

  /* ============================
     JOIN SESSION
  ============================ */
  socket.on("JOIN_SESSION", async ({ sessionId }) => {
    try {
      if (!sessionId) return;

      const session = await ConsultSession.findById(sessionId);
      if (!session) return;

      const room = `session:${sessionId}`;
      socket.join(room);
      console.log(`📌 Joined session room: ${room}`);

    } catch (err) {
      console.error("Join session error:", err);
    }
  });


  /* ============================
     SEND MESSAGE
  ============================ */
  socket.on("SEND_MESSAGE", async (data) => {
    try {
      const { sessionId, content } = data;
      if (!sessionId || !content) return;

      const session = await ConsultSession.findById(sessionId);
      if (!session || session.status !== "ACTIVE") return;

      const newMessage = await Message.create({
        sessionId,
        senderId: socket.user.id,
        senderRole: "USER",
        messageType: "TEXT",
        content,
        status: "SENT",
      });

      const room = `session:${sessionId}`;

      io.to(room).emit("RECEIVE_MESSAGE", {
        _id: newMessage._id,
        sessionId,
        content,
        senderRole: newMessage.senderRole,
        createdAt: newMessage.createdAt,
      });

    } catch (err) {
      console.error("Message error:", err);
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
