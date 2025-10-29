// models/MentorBlackout.js
const mongoose = require("mongoose");
const MentorBlackoutSchema = new mongoose.Schema(
  {
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startISO: { type: String, required: true }, // yyyy-mm-dd
    endISO:   { type: String, required: true }, // yyyy-mm-dd
    reason:   { type: String, default: "" },
  },
  { timestamps: true }
);

MentorBlackoutSchema.index({ mentorId: 1, startISO: 1, endISO: 1 });

module.exports = mongoose.model("MentorBlackout", MentorBlackoutSchema);