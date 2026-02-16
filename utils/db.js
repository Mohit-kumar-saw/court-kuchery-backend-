const mongoose = require("mongoose");

const connectDB = async () => {
  await mongoose.connect(process.env.URL_DB);
  console.log("Connected to MongoDB");
};

module.exports = connectDB;