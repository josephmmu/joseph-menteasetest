// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Role = require("../models/Role");

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

const toId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v !== null) {
    if (v._id) return String(v._id);
    if (v.id) return String(v.id);
  }
  return String(v);
};

// Attach req.user with normalized role/program
exports.protect = async (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    if (!token) return res.status(401).json({ message: "Not authorized, token missing" });

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.id) return res.status(401).json({ message: "Invalid or expired token" });

    const dbUser = await User.findById(decoded.id)
      .populate("roleId", "roleName")
      .populate("programId", "programName")
      .select("-__v")
      .lean();

    if (!dbUser) return res.status(401).json({ message: "User not found" });

    const roleNameRaw =
      (dbUser.roleId && dbUser.roleId.roleName) ||
      dbUser.roleName ||
      dbUser.role ||
      "";
    const roleNameLower = String(roleNameRaw).toLowerCase();

    const programIdStr = toId(dbUser.programId);
    const programName =
      (dbUser.programId && dbUser.programId.programName) ||
      dbUser.program ||
      dbUser.programName ||
      "";

    req.user = {
      ...dbUser,
      _id: toId(dbUser._id),
      roleId: dbUser.roleId?._id ? toId(dbUser.roleId._id) : dbUser.roleId,
      roleName: roleNameRaw,
      _roleNameLower: roleNameLower,
      programId: programIdStr,
      programName,
    };

    next();
  } catch (err) {
    console.error("protect error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

exports.authorize = (...roles) => {
  const allowed = (roles || []).map((r) => String(r || "").toLowerCase());
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Not authorized" });

      let roleLower = req.user._roleNameLower || "";
      if (!roleLower && req.user.roleId) {
        try {
          const r = await Role.findById(req.user.roleId).select("roleName");
          roleLower = String(r?.roleName || "").toLowerCase();
        } catch {}
      }
      if (!roleLower) return res.status(403).json({ message: "Role not authorized" });

      if (allowed.length && !allowed.includes(roleLower)) {
        return res.status(403).json({ message: "Role not authorized" });
      }
      next();
    } catch (e) {
      console.error("authorize error:", e);
      return res.status(403).json({ message: "Role not authorized" });
    }
  };
};