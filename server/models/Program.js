const mongoose = require("mongoose");

const programSchema = new mongoose.Schema({
  programName: {
    type: String,
    required: true,
    unique: true,
    enum: ["IT", "BA", "GE"],
  },
});

module.exports =
  mongoose.models.Program || mongoose.model("Program", programSchema);
