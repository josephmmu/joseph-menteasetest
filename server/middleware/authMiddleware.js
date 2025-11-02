// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Role = require("../models/Role");

// Try multiple secrets to match whatever was used to sign the token in older code paths.
const JWT_SECRETS = [
  process.env.JWT_SECRET,
  "ooosecretkeeyy1",
  "devsecret",
].filter(Boolean);

const toId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.id) return String(v.id);
  }
  return String(v);
};

function getToken(req) {
  // Authorization header (case-insensitive)
  const h = req.headers?.authorization || req.get?.("Authorization");
  if (h && /^bearer /i.test(h)) return h.slice(7).trim();
  // Cookie
  if (req.cookies && req.cookies.token) return req.cookies.token;
  // Query (fallback)
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function verifyWithSecrets(token) {
  let lastErr;
  for (const secret of JWT_SECRETS) {
    try {
      return jwt.verify(token, secret);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Invalid token");
}

// Attach req.user with normalized role/program; accepts Bearer, cookie, or ?token=
exports.protect = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: "Not authorized, token missing" });

    const decoded = verifyWithSecrets(token);
    const userId = toId(decoded._id || decoded.id);
    if (!userId) return res.status(401).json({ message: "Invalid or expired token" });

    const dbUser = await User.findById(userId)
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
    const roleNameLower = String(roleNameRaw || "").toLowerCase();

    const programIdStr = toId(dbUser.programId);
    const programName =
      (dbUser.programId && dbUser.programId.programName) ||
      dbUser.program ||
      dbUser.programName ||
      "";

    req.user = {
      ...dbUser,
      _id: toId(dbUser._id),
      roleId: dbUser.roleId?._id ? toId(dbUser.roleId._id) : toId(dbUser.roleId),
      roleName: roleNameRaw,
      _roleNameLower: roleNameLower,
      programId: programIdStr,
      programName,
    };

    next();
  } catch (err) {
    console.error("protect error:", err?.message || err);
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
      console.error("authorize error:", e?.message || e);
      return res.status(403).json({ message: "Role not authorized" });
    }
  };
};

// alias so existing imports keep working
exports.authMiddleware = exports.protect;