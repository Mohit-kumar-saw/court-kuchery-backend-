module.exports = (io, socket) => {

    /* ======================================
       JOIN CONSULTATION ROOM
    ======================================= */
    socket.on("JOIN_SESSION", ({ sessionId }) => {
      if (!sessionId) return;
  
      socket.join(`session:${sessionId}`);
      console.log(`📌 Joined session room: session:${sessionId}`);
    });
  
    /* ======================================
       LEAVE SESSION ROOM
    ======================================= */
    socket.on("LEAVE_SESSION", ({ sessionId }) => {
      if (!sessionId) return;
  
      socket.leave(`session:${sessionId}`);
      console.log(`🚪 Left session room: session:${sessionId}`);
    });
  
  };
  