// models/Course.js
const mongoose = require("mongoose");

/** ---------------- Availability (per-course) ----------------
 *  - mentoringBlock: default daily mentoring window (24h HH:mm)
 *  - allowedDays: base days students can book (["Mon","Tue",...])
 *  - openDates / closedDates: explicit per-day overrides ("YYYY-MM-DD")
 *  - _meta: audit fields only (no grace / no policy)
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"
const HHMM_REGEX = /^\d{2}:\d{2}$/;           // "HH:mm"
const WEEKDAY_ENUM = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// AvailabilityMetaSchema (no policy / no grace)
const AvailabilityMetaSchema = new mongoose.Schema(
  {
    // Map: ISO date => { openedAt }
    openDates: {
      type: Map,
      of: new mongoose.Schema({ openedAt: { type: String, trim: true } }, { _id: false }),
      default: {},
    },
    // Map: ISO date => { closedAt }
    closedDates: {
      type: Map,
      of: new mongoose.Schema({ closedAt: { type: String, trim: true } }, { _id: false }),
      default: {},
    },
    lastEditedAt: { type: Date, default: null },
  },
  { _id: false }
);

const AvailabilitySchema = new mongoose.Schema(
  {
    mentoringBlock: {
      start: { type: String, default: "07:00", trim: true, match: HHMM_REGEX },
      end:   { type: String, default: "08:15", trim: true, match: HHMM_REGEX },
    },
    allowedDays: { type: [String], default: [], enum: WEEKDAY_ENUM },
    openDates: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.every((d) => ISO_DATE_REGEX.test(d)),
        message: "openDates must contain ISO dates (YYYY-MM-DD).",
      },
    },
    closedDates: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.every((d) => ISO_DATE_REGEX.test(d)),
        message: "closedDates must contain ISO dates (YYYY-MM-DD).",
      },
    },
    _meta: { type: AvailabilityMetaSchema, default: () => ({}) },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, trim: true },
    courseName: { type: String, required: true, trim: true },
    yearLevel: { type: Number, required: true },

    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      required: true,
      index: true,
    },

    section: { type: String, required: true, trim: true },

    // legacy schedule kept for compatibility with existing UIs
    schedule: {
      days: { type: String, trim: true },
      time: { type: String, trim: true }, // e.g. "19:30-20:45"
      timeSlot: { type: String, trim: true },
      startTime: { type: String, trim: true },
      endTime: { type: String, trim: true },
    },

    defaultMeetLink: { type: String, default: "", trim: true },

    availability: { type: AvailabilitySchema, default: () => ({}) },

    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

courseSchema.virtual("studentCount").get(function () {
  return Array.isArray(this.students) ? this.students.length : 0;
});

courseSchema.index({ programId: 1 });
courseSchema.index({ mentorId: 1 });
courseSchema.index({ termId: 1 });
courseSchema.index(
  { courseCode: 1, courseName: 1, section: 1, termId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("Course", courseSchema);