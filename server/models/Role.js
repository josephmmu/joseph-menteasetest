const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
  roleName: {
    type: String,
    required: true,
    unique: true,
    enum: ["student", "mentor", "admin", "pendingAdmin"],
  },
});

module.exports = mongoose.models.Role || mongoose.model("Role", roleSchema);
