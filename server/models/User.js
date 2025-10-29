const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      match: /@mmdc\.mcl\.edu\.ph$/,
    },
    photoUrl: String,
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: false,
    },
  },
  {
    timestamps: true,
    collection: "users",
  }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
