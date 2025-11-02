// backend/models/SessionNote.js
const mongoose = require("mongoose");

const SessionNoteSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true, index: true },
    author:  { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true, index: true },

    // Canonical role as ObjectId
    roleId:  { type: mongoose.Schema.Types.ObjectId, ref: "Role", default: null, index: true },

    // Optional human-readable cache (for quick display)
    roleName: { type: String, default: "" },

    topicsDiscussed: { type: String, default: "" },
    nextSteps:       { type: String, default: "" },

    lastEditedAt:     { type: Date, default: Date.now },
    lastEditedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastEditedByName: { type: String, default: "" },
  },
  { timestamps: true, collection: "session_notes" }
);

// Helpful indexes (all NON-unique)
SessionNoteSchema.index({ session: 1, author: 1 });
SessionNoteSchema.index({ session: 1, updatedAt: -1 });

module.exports =
  mongoose.models.SessionNote || mongoose.model("SessionNote", SessionNoteSchema);