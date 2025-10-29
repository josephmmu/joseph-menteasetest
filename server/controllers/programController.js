const Program = require("../models/Program");

// @desc    Get all programs
// @route   GET /api/programs
const getAllPrograms = async (req, res) => {
  try {
    const programs = await Program.find({}).sort({ programName: 1 });
    res.json(programs);
  } catch (error) {
    console.error("Error fetching programs:", error);
    res.status(500).json({ message: "Server error while fetching programs." });
  }
};

module.exports = {
  getAllPrograms,
};
