const User = require("../models/User");
const Role = require("../models/Role");
const Program = require("../models/Program");
const jwt = require("jsonwebtoken");

const googleLogin = async (req, res) => {
  const { email, name, googleId, photoUrl, role } = req.body;
  console.log("--- Login Attempt ---");
  console.log("Request Body:", req.body);

  if (!email.endsWith("@mmdc.mcl.edu.ph")) {
    return res.status(403).json({ message: "Invalid email domain" });
  }

  try {
    let user = await User.findOne({ email })
      .populate("roleId")
      .populate("programId");

    if (user) {
      console.log("Found existing user:", user.email);
    } else {
      console.log("User not found. Creating new user...");
      console.log(`Searching for role: '${role}'`);

      const userRole = await Role.findOne({ roleName: role });

      if (!userRole) {
        console.error(`CRITICAL: Role '${role}' not found in the database.`);
        return res.status(500).json({
          message: `Server configuration error: Role '${role}' not found.`,
        });
      }

      console.log(`Found role document. ID: ${userRole._id}`);

      const newUser = await User.create({
        googleId,
        email,
        name,
        photoUrl,
        roleId: userRole._id,
        programId: null,
      });
      console.log("New user created:", newUser.email);

      user = await User.findById(newUser._id)
        .populate("roleId")
        .populate("programId");
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.roleId ? user.roleId.roleName : null,
        name: user.name,
        program: user.programId ? user.programId.programName : null,
        photoUrl: user.photoUrl,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("Login successful. Token generated.");
    res.json({ token, user });
  } catch (err) {
    console.error("--- LOGIN FAILED ---", err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
};

module.exports = {
  googleLogin,
};
