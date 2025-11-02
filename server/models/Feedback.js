// models/Feedback.js
const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    // Core linkage
    session:  { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },

    // Author / Recipient
    from:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // author
    to:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // recipient

    // Author role (disambiguates student->mentor vs mentor->student records)
    role:     { type: String, enum: ["student", "mentor"], required: true },

    // Content
    notes:    { type: String, required: true },
    anonymous:{ type: Boolean, default: false },

    // Denormalized helpers (optional)
    subjectCode: String,
    subjectName: String,
    section:     String,
    topic:       String,
    sessionStart: Date,
    sessionEnd:   Date,

    // Visibility / lifecycle
    finalized:             { type: Boolean, default: false }, // false=draft, true=visible to recipient
    visibleToRecipientAt:  { type: Date, default: null },     // set when finalized flips true
    readAt:                { type: Date, default: null },     // recipient read timestamp
  },
  { timestamps: true, collection: "feedbacks" }
);

/**
 * Exactly one document per (session, from, to, role).
 * This avoids collisions between opposite directions and keeps repeated saves idempotent.
 */
feedbackSchema.index({ session: 1, from: 1, to: 1, role: 1 }, { unique: true });

// Common query paths
feedbackSchema.index({ to: 1, finalized: 1, visibleToRecipientAt: 1, createdAt: -1 });
feedbackSchema.index({ from: 1, finalized: 1, createdAt: -1 });

module.exports = mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);