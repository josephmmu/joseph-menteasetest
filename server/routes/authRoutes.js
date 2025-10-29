const express = require("express");
const { googleLogin } = require("../controllers/authController");
const User = require("../models/User");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Program = require("../models/Program");
const Role = require("../models/Role");

router.post("/google", googleLogin);

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Update user program
router.put("/update-program", verifyToken, async (req, res) => {
  try {
    const { program: programName } = req.body;
    const userId = req.user.id;

    // 1. Find the Program document to get its ID
    const programDoc = await Program.findOne({ programName });
    if (!programDoc) {
      return res
        .status(400)
        .json({ message: `Invalid program: ${programName}` });
    }

    // 2. Get user and populate their role to check it
    const currentUser = await User.findById(userId).populate("roleId");
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // 3. Validate program based on the populated role name
    const userRole = currentUser.roleId.roleName;
    const validPrograms = ["IT", "BA"];
    if (userRole === "mentor") {
      validPrograms.push("GE");
    }

    if (!programName || !validPrograms.includes(programName)) {
      return res
        .status(400)
        .json({ message: `Invalid program selection for your role.` });
    }

    // 4. Update user with the correct programId and populate fields for the response
    const user = await User.findByIdAndUpdate(
      userId,
      { programId: programDoc._id }, // Use programId and the document's _id
      { new: true }
    )
      .populate("roleId")
      .populate("programId");

    // 5. Generate a new, correct token
    const newToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.roleId ? user.roleId.roleName : null,
        program: user.programId ? user.programId.programName : null,
        photoUrl: user.photoUrl,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Program updated successfully",
      token: newToken,
      user: user, // Send back the fully populated user object
    });
  } catch (error) {
    console.error("Update program error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
