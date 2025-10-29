const mongoose = require("mongoose");

/** Availability (per-course) */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"
const HHMM_REGEX = /^\d{2}:\d{2}$/;           // "HH:mm"
const WEEKDAY_ENUM = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
        validator: (arr) => (Array.isArray(arr) ? arr.every((d) => ISO_DATE_REGEX.test(d)) : false),
        message: "openDates must contain ISO dates (YYYY-MM-DD).",
      },
    },
    closedDates: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => (Array.isArray(arr) ? arr.every((d) => ISO_DATE_REGEX.test(d)) : false),
        message: "closedDates must contain ISO dates (YYYY-MM-DD).",
      },
    },
    closedMeta: { type: Map, of: Number, default: {} },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, trim: true },
    courseName: { type: String, required: true, trim: true },
    yearLevel: { type: Number, required: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program", required: true, index: true },
    mentorId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    termId:    { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", required: true, index: true },
    section:   { type: String, required: true, trim: true },
    schedule: {
      days: { type: String, trim: true },
      time: { type: String, trim: true },
      timeSlot: { type: String, trim: true },
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