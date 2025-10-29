const AcademicTerm = require("../models/AcademicTerm");

// A helper to combine year fields for the frontend
const formatTermForAPI = (term) => ({
  termId: term._id,
  schoolYear: `${term.schoolStartYear}-${term.schoolEndYear}`,
  term: term.term,
  startDate: term.startDate ? term.startDate.toISOString().split("T")[0] : null,
  endDate: term.endDate ? term.endDate.toISOString().split("T")[0] : null,
  isActive: term.isActive,
});

// @desc    Get all academic terms
// @route   GET /api/academic-terms
const getAllTerms = async (req, res) => {
  try {
    const terms = await AcademicTerm.find().sort({
      schoolStartYear: -1,
      term: -1,
    });
    const formattedTerms = terms.map(formatTermForAPI);
    res.json(formattedTerms);
  } catch (error) {
    console.error("Error in getAllTerms:", error);
    res.status(500).json({ message: "Server error fetching terms" });
  }
};

// @desc    Get the single active term
// @route   GET /api/academic-terms/active
const getActiveTerm = async (req, res) => {
  try {
    const activeTerm = await AcademicTerm.findOne({ isActive: true });

    if (!activeTerm) {
      // It's okay if no term is active, just return null
      return res.status(200).json(null);
    }

    res.json(formatTermForAPI(activeTerm));
  } catch (error) {
    console.error("Error fetching active term:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching active term." });
  }
};

// @desc    Create a new academic term
// @route   POST /api/academic-terms
const createTerm = async (req, res) => {
  try {
    const { schoolYear, term, startDate, endDate, isActive } = req.body;
    const [schoolStartYear, schoolEndYear] = schoolYear.split("-");

    // Check if a term with the same school year and term number already exists.
    const existingTerm = await AcademicTerm.findOne({
      schoolStartYear,
      term,
    });

    if (existingTerm) {
      return res.status(409).json({
        message: `An academic term for ${schoolYear} - Term ${term} already exists.`,
      });
    }

    // If this new term is set to active, deactivate all other terms first.
    if (isActive) {
      await AcademicTerm.updateMany({}, { isActive: false });
    }

    const newTerm = await AcademicTerm.create({
      schoolStartYear,
      schoolEndYear,
      term,
      startDate,
      endDate,
      isActive,
    });

    res.status(201).json(formatTermForAPI(newTerm));
  } catch (error) {
    res
      .status(400)
      .json({ message: "Failed to create term", error: error.message });
  }
};

// @desc    Update an academic term
// @route   PUT /api/academic-terms/:id
const updateTerm = async (req, res) => {
  try {
    // The active status should only be changed via the dedicated 'set-active' endpoint.
    const { schoolYear, term, ...rest } = req.body;
    const [schoolStartYear, schoolEndYear] = schoolYear.split("-");

    // Check if another term with the new details already exists.
    const existingTerm = await AcademicTerm.findOne({
      schoolStartYear,
      term,
      _id: { $ne: req.params.id }, // Exclude the current term from the check
    });

    if (existingTerm) {
      return res.status(409).json({
        message: `An academic term for ${schoolYear} - Term ${term} already exists.`,
      });
    }

    const updatedTerm = await AcademicTerm.findByIdAndUpdate(
      req.params.id,
      {
        schoolStartYear,
        schoolEndYear,
        term,
        ...rest,
      },
      { new: true, runValidators: true }
    );

    if (!updatedTerm) {
      return res.status(404).json({ message: "Term not found" });
    }

    res.json(formatTermForAPI(updatedTerm));
  } catch (error) {
    res
      .status(400)
      .json({ message: "Failed to update term", error: error.message });
  }
};

// @desc    Delete an academic term
// @route   DELETE /api/academic-terms/:id
const deleteTerm = async (req, res) => {
  try {
    // First, find the term without deleting it
    const term = await AcademicTerm.findById(req.params.id);

    if (!term) {
      return res.status(404).json({ message: "Term not found" });
    }

    // Block deletion if the term is active
    if (term.isActive) {
      return res.status(400).json({
        message:
          "Cannot delete an active term. Please set another term as active first.",
      });
    }

    // If not active, proceed with deletion
    await AcademicTerm.findByIdAndDelete(req.params.id);

    res.json({ message: "Term deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error deleting term" });
  }
};

// @desc    Set a term as the single active term
// @route   PATCH /api/academic-terms/:id/set-active
const setActiveTerm = async (req, res) => {
  try {
    // Step 1: Set all other terms to inactive
    await AcademicTerm.updateMany(
      { _id: { $ne: req.params.id } },
      { isActive: false }
    );

    // Step 2: Set the selected term to active
    const newActiveTerm = await AcademicTerm.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    if (!newActiveTerm) {
      return res.status(404).json({ message: "Term not found" });
    }

    // Return the full, formatted term object
    res.json(formatTermForAPI(newActiveTerm));
  } catch (error) {
    console.error("Error in setActiveTerm:", error);
    res.status(500).json({ message: "Server error setting active term" });
  }
};

// @desc    Deactivate a specific term
// @route   PATCH /api/academic-terms/:id/deactivate
const deactivateTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!term) {
      return res.status(404).json({ message: "Term not found" });
    }

    res.json({ message: "Term deactivated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error deactivating term" });
  }
};

// @desc    Minimal list of terms for mentors (id + labels)
// @route   GET /api/academic-terms/min
const getTermsForMentor = async (req, res) => {
  try {
    const terms = await AcademicTerm.find().sort({ schoolStartYear: -1, term: -1 });
    const formatted = terms.map((t) => ({
      termId: t._id,
      schoolYear: `${t.schoolStartYear}-${t.schoolEndYear}`,
      term: t.term,
      isActive: !!t.isActive,
    }));
    res.json(formatted);
  } catch (e) {
    console.error('Error fetching terms (mentor):', e);
    res.status(500).json({ message: 'Server error fetching terms' });
  }
};

module.exports = {
  getAllTerms,
  createTerm,
  updateTerm,
  deleteTerm,
  setActiveTerm,
  getActiveTerm,
  deactivateTerm,
  getTermsForMentor,
};

