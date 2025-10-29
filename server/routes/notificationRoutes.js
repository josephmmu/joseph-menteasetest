// routes/notificationRoutes.js
const express = require("express");
const Notification = require("../models/Notification");

const router = express.Router();

/* Helper to sniff current user from middleware (if you have one) or headers.
   Adjust this if your auth middleware sets req.user differently. */
function getUserIdFromReq(req) {
  return (
    req.user?.id ||
    req.user?._id ||
    req.userId ||
    req.auth?.id ||
    req.headers["x-user-id"] || // last-resort dev override
    null
  );
}

/* Normalizes incoming payloads from various clients:
   - Our UI uses: { userId, title, content, pageRelated, status }
   - BookSessionModal may send: { toUserId, title, message, link, createdAt }
*/
function normalizeIncoming(body = {}, fallbackUserId = null) {
  const userId =
    body.userId ||
    body.to ||
    body.toUserId ||
    body.recipientId ||
    fallbackUserId;

  const title = body.title || body.subject || "Notification";
  const content = body.content || body.message || body.body || "";
  const pageRelated = body.pageRelated || body.link || body.url || "";
  const status = body.status || "unread";

  const createdAt = body.createdAt ? new Date(body.createdAt) : undefined;

  return {
    userId,
    title,
    content,
    pageRelated,
    status,
    ...(createdAt ? { createdAt } : {}),
  };
}

/* =========================
   Routes
   ========================= */

// Create one
router.post("/", async (req, res) => {
  try {
    const me = getUserIdFromReq(req);
    const data = normalizeIncoming(req.body, me);
    if (!data.userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const doc = await Notification.create(data);
    return res.status(201).json(doc);
  } catch (err) {
    console.error("Create notification error:", err);
    res.status(500).json({ message: "Failed to create notification" });
  }
});

// Convenience “send” route (alias of create)
router.post("/send", async (req, res) => {
  try {
    const me = getUserIdFromReq(req);
    const data = normalizeIncoming(req.body, me);
    if (!data.userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const doc = await Notification.create(data);
    return res.status(201).json(doc);
  } catch (err) {
    console.error("Send notification error:", err);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

// List current user's notifications
router.get("/mine", async (req, res) => {
  try {
    const me = getUserIdFromReq(req);
    if (!me) return res.status(200).json([]);

    const items = await Notification.find({ userId: me })
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (err) {
    console.error("Fetch mine error:", err);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// Generic list (by userId or ?recipient=me)
router.get("/", async (req, res) => {
  try {
    const { userId, recipient } = req.query;
    const me = getUserIdFromReq(req);
    const targetUserId = recipient === "me" ? me : userId;

    const query = targetUserId ? { userId: targetUserId } : {};
    const items = await Notification.find(query).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    console.error("Fetch notifications error:", err);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// Mark one as read
router.patch("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const nowRead = req.body.read === true || req.body.status === "read";

    const patch = nowRead
      ? { status: "read", readAt: new Date() }
      : { ...(req.body.status ? { status: req.body.status } : {}) };

    const doc = await Notification.findOneAndUpdate(
      { $or: [{ _id: id }, { notification_id: id }] },
      patch,
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    console.error("Patch notification error:", err);
    res.status(500).json({ message: "Failed to update notification" });
  }
});

// Mark as read (POST alias)
router.post("/:id/read", async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Notification.findOneAndUpdate(
      { $or: [{ _id: id }, { notification_id: id }] },
      { status: "read", readAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    console.error("Read notification error:", err);
    res.status(500).json({ message: "Failed to mark as read" });
  }
});

// Mark-all read (for current user)
router.post("/mark-all-read", async (req, res) => {
  try {
    const me = getUserIdFromReq(req);
    if (!me) return res.status(200).json({ updated: 0 });

    const result = await Notification.updateMany(
      { userId: me, status: { $ne: "read" } },
      { $set: { status: "read", readAt: new Date() } }
    );
    res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    console.error("Mark all read error:", err);
    res.status(500).json({ message: "Failed to mark all as read" });
  }
});

module.exports = router;