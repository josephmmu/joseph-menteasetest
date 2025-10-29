const mongoose = require("mongoose");

const courseStudentListSchema = new mongoose.Schema({
  // Link to the specific CourseOffering
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  // Link to the User model (for the enrolled student)
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

// Prevent a student from being added to the same course offering twice
courseStudentListSchema.index({ courseId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("CourseStudentList", courseStudentListSchema);
