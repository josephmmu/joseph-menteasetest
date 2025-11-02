// models/Notification.js
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    type: { type: String, enum: ["session", "feedback", "notes"], default: "session", index: true },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    content: { type: String, default: "" },
    link: { type: String, default: "/my-schedule" },
    pageRelated: { type: String, default: "/my-schedule" },
    read: { type: Boolean, default: false, index: true },
    meta: { type: Object, default: {} },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: "notifications" }
);

/* NEW: speed up list/unread queries */
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);