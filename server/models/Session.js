const mongoose = require("mongoose");

const NotesSchema = new mongoose.Schema(
  {
    topicsDiscussed: { type: String, default: "" },
    nextSteps: { type: String, default: "" },
    lastEditedAt: { type: Date, default: null },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastEditedByName: { type: String, default: "" },
  },
  { _id: false }
);

const ParticipantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["booked", "cancelled"], default: "booked" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, index: true, unique: true },
    offeringID: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    scheduleStart: { type: Date, required: true, index: true },
    scheduleEnd: { type: Date, required: true },

    meetLink: { type: String, default: "" },
    topic: { type: String, default: "", trim: true, maxlength: 300 },
    recordingUrl: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "cancelled", "completed", "rescheduled"],
      default: "pending",
      index: true,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    cancelReason: { type: String, default: "" },
    rescheduledFrom: { type: String, default: "" },
    rescheduleRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rescheduleReason: { type: String, default: "" },

    participants: { type: [ParticipantSchema], default: [] },
    capacity: { type: Number, min: 1, default: 1 },
    isGroup: { type: Boolean, default: false },

    notes: { type: NotesSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "sessions" }
);

SessionSchema.path("scheduleEnd").validate(function (v) {
  if (!this.scheduleStart || !v) return true;
  return v > this.scheduleStart;
}, "scheduleEnd must be after scheduleStart");

SessionSchema.pre("save", function (next) {
  if (!this.sessionId) this.sessionId = this._id.toString();
  const bookedCount = (this.participants || []).filter((p) => p.status === "booked").length;
  this.isGroup = (this.capacity || 1) > 1 || bookedCount > 1;
  if (!this.capacity || this.capacity < 1) this.capacity = 1;
  next();
});

SessionSchema.index({ mentorId: 1, scheduleStart: 1 });
SessionSchema.index({ offeringID: 1, scheduleStart: 1 });
SessionSchema.index({ "participants.user": 1 });
SessionSchema.index({ scheduleStart: 1, scheduleEnd: 1 });


module.exports = mongoose.models.Session || mongoose.model("Session", SessionSchema);