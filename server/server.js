// backend/server.js
const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/* =========================
   Express app & middleware
   ========================= */
const app = express();

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   Routes
   ========================= */
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const academicTermRoutes = require("./routes/academicTermRoutes");
const courseRoutes = require("./routes/courseRoutes");
const mentorBlackoutRoutes = require("./routes/mentorBlackoutRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const sessionNoteRoutes = require("./routes/sessionNoteRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/academic-terms", academicTermRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/mentor-blackouts", mentorBlackoutRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/session-notes", sessionNoteRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/notifications", notificationRoutes);


app.get("/", (_req, res) => res.send("MentEase backend is running 🚀"));
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use((req, res) => res.status(404).json({ message: "Not Found" }));
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

/* =========================
   Mongo + start server
   ========================= */
mongoose.set("strictQuery", true);
const { MONGO_URI, PORT = 5000 } = process.env;

mongoose
  .connect(MONGO_URI, { autoIndex: true })
  .then(() => {
    console.log("MongoDB Connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });

module.exports = app;