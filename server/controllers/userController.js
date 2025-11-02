const User = require("../models/User");
const Role = require("../models/Role");
const Program = require("../models/Program");

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .populate("roleId", "roleName")
      .populate("programId", "programName")
      .sort({ createdAt: -1 });

    // Transform the data to match the frontend's expected format
    const formattedUsers = users.map((user) => ({
      id: user._id, // Include ID for future edit/delete operations
      name: user.name,
      email: user.email,
      photoUrl: user.photoUrl,
      role: user.roleId ? user.roleId.roleName : "N/A",
      program: user.programId ? user.programId.programName : "N/A",
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server error while fetching users." });
  }
};

const updateUser = async (req, res) => {
  try {
    const { role, program } = req.body;
    const { id } = req.params;

    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find Role and Program documents to get their ObjectIds
    const roleDoc = await Role.findOne({ roleName: role });
    if (!roleDoc) {
      return res.status(400).json({ message: `Invalid role: ${role}` });
    }

    let programDoc = null;
    if (program) {
      programDoc = await Program.findOne({ programName: program });
      if (!programDoc) {
        return res.status(400).json({ message: `Invalid program: ${program}` });
      }
    }

    // Update the user
    userToUpdate.roleId = roleDoc._id;
    userToUpdate.programId = programDoc ? programDoc._id : null;
    await userToUpdate.save();

    // Repopulate for the response
    const updatedUser = await User.findById(id)
      .populate("roleId", "roleName")
      .populate("programId", "programName");

    res.json({
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      photoUrl: updatedUser.photoUrl,
      role: updatedUser.roleId ? updatedUser.roleId.roleName : "N/A",
      program: updatedUser.programId
        ? updatedUser.programId.programName
        : "N/A",
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server error while updating user." });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Server error while deleting user." });
  }
};

// Lightweight search for students, available to mentors and admins
const searchStudents = async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();

    // Find the Role id for 'student'
    const studentRole = await Role.findOne({ roleName: "student" }, "_id");
    if (!studentRole) {
      return res.status(500).json({ message: "Student role not configured" });
    }

    const filter = { roleId: studentRole._id };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const users = await (q
      ? User.find(filter, "name email")
          .sort({ name: 1 })
          .limit(20)
          .lean()
      : User.find(filter, "name email")
          .sort({ createdAt: -1 })
          .limit(20)
          .lean());

    const out = users
      .map((u) => ({
        id: u._id,
        _id: u._id,
        name: u.name,
        email: u.email,
      }))
      .filter((u) => !!u.email);

    res.json(out);
  } catch (error) {
    console.error("Error searching students:", error);
    res.status(500).json({ message: "Server error while searching students." });
  }
};

// Minimal: resolve user ids to names/emails (mentor/admin)
const namesByIds = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.json([]);
    const uniq = [...new Set(ids.map((x) => String(x)).filter(Boolean))];
    const users = await User.find({ _id: { $in: uniq } })
      .select("name email firstName lastName username")
      .lean();
    const out = users.map((u) => ({
      _id: u._id,
      id: u._id,
      name:
        u.name ||
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
        u.username ||
        u.email ||
        "",
      email: u.email || "",
    }));
    res.json(out);
  } catch (error) {
    console.error("Error resolving names:", error);
    res.status(500).json({ message: "Server error while resolving names." });
  }
};

module.exports = {
  getAllUsers,
  updateUser,
  deleteUser,
  searchStudents,
  namesByIds,
};
