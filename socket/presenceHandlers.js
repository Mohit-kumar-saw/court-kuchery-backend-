const onlineUsers = new Map();

module.exports = (io, socket) => {

  socket.on("join", ({ userId, role }) => {
    onlineUsers.set(userId, socket.id);

    socket.join(userId); // personal room

    console.log(`${role} ${userId} is online`);

    io.emit("user_online", { userId });
  });

  socket.on("disconnect", () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        io.emit("user_offline", { userId });
        break;
      }
    }
  });
};
