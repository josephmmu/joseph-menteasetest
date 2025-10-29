const mongoose = require("mongoose");

const academicTermSchema = new mongoose.Schema(
  {
    schoolStartYear: {
      type: Number,
      required: [true, "School start year is required"],
    },
    schoolEndYear: {
      type: Number,
      required: [true, "School end year is required"],
    },
    term: {
      type: Number,
      required: [true, "Term number is required"],
      enum: [1, 2, 3],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "academic_terms",
  }
);

// Custom validation to ensure end year is after start year
academicTermSchema.pre("save", function (next) {
  if (this.schoolEndYear <= this.schoolStartYear) {
    next(new Error("School end year must be after start year."));
  } else {
    next();
  }
});

module.exports =
  mongoose.models.AcademicTerm ||
  mongoose.model("AcademicTerm", academicTermSchema);
