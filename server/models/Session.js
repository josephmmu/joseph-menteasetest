const mongoose = require("mongoose");

/** Subdocument for participants (students in the session) */
const ParticipantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["booked", "cancelled"],
      default: "booked",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const SessionSchema = new mongoose.Schema(
  {
    // PK (string) in addition to Mongo's _id, kept in sync
    sessionId: {
      type: String,
      index: true,
      unique: true,
    },

    // FK -> Course/Offering
    offeringID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    // FK -> Mentor (User)
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // schedule
    scheduleStart: { type: Date, required: true, index: true },
    scheduleEnd:   { type: Date, required: true },

    // misc
    meetLink: { type: String, default: "" },

    // ✅ topic of the session (saved from FE)
    topic: { type: String, default: "", trim: true, maxlength: 300 },

    // ✅ recording URL (mentor/admin can set after the session)
    recordingUrl: { type: String, default: "" },

    // status: align to your workflow
    status: {
      type: String,
      enum: ["pending", "cancelled", "completed", "rescheduled"],
      default: "pending",
      index: true,
    },

    // audit FKs
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // reasons / reschedule meta
    cancelReason: { type: String, default: "" },
    rescheduledFrom: { type: String, default: "" }, // store previous sessionId (string)
    rescheduleRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rescheduleReason: { type: String, default: "" },

    // ===== Group / participants support =====
    // list of all students in this session
    participants: {
      type: [ParticipantSchema],
      default: [], // we'll keep it empty by default; API can push creator/student
    },

    // capacity > 1 means it's a group session
    capacity: { type: Number, min: 1, default: 1 },

    // derived flag (helps FE filters / queries)
    isGroup: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ===== Validations =====
SessionSchema.path("scheduleEnd").validate(function (v) {
  // Ensure scheduleEnd is after scheduleStart
  if (!this.scheduleStart || !v) return true;
  return v > this.scheduleStart;
}, "scheduleEnd must be after scheduleStart");

// ===== Pre-save: keep sessionId + isGroup in sync =====
SessionSchema.pre("save", function (next) {
  if (!this.sessionId) this.sessionId = this._id.toString();

  const bookedCount = (this.participants || []).filter(p => p.status === "booked").length;
  this.isGroup = (this.capacity || 1) > 1 || bookedCount > 1;

  // normalize capacity
  if (!this.capacity || this.capacity < 1) this.capacity = 1;

  next();
});

// ===== Helpful indexes =====
SessionSchema.index({ mentorId: 1, scheduleStart: 1 });
SessionSchema.index({ offeringID: 1, scheduleStart: 1 });
SessionSchema.index({ "participants.user": 1 });
SessionSchema.index({ scheduleStart: 1, scheduleEnd: 1 });

module.exports = mongoose.model("Session", SessionSchema);