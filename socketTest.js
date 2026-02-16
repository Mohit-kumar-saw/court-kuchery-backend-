const { io } = require("socket.io-client");

const socket = io("http://localhost:4000");

socket.on("connect", () => {
  console.log("Connected:", socket.id);

  // Join test room
  socket.emit("join_session", { sessionId: "TEST123" });

  // Send message
  socket.emit("send_message", {
    sessionId: "TEST123",
    senderId: "USER1",
    message: "Hello Lawyer"
  });
});

socket.on("receive_message", (data) => {
  console.log("New Message:", data);
});
