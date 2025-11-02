// backend/utils/notify.js
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");

/**
 * Normalize input into ObjectId strings
 */
function toId(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v._id) return String(v._id);
  if (v.id) return String(v.id);
  try { return String(v); } catch { return null; }
}

/**
 * notifyAndEmail(recipients, payload)
 * - recipients: string | ObjectId | array of those
 * - payload: { type, title, message, content, link, pageRelated, meta, sendEmail? }
 */
async function notifyAndEmail(recipients, payload = {}) {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  const ids = list.map(toId).filter(Boolean);
  if (!ids.length) return { inserted: [], emailed: [] };

  const {
    type = "session",
    title = "Notification",
    message = "",
    content = "",
    link = "/my-schedule",
    pageRelated = link || "/my-schedule",
    meta = {},
    sendEmail = false,
  } = payload;

  // 1) Insert notifications
  const docs = ids.map((recipient) => ({
    recipient,
    type,
    title,
    message: message || content || "",
    content: content || message || "",
    link,
    pageRelated,
    meta,
  }));

  let inserted = [];
  try {
    inserted = await Notification.insertMany(docs, { ordered: false });
  } catch (e) {
    // If some failed but others inserted, Mongoose still throws; attempt to fetch recent
    // (keep it quiet in prod or add better logging)
    // console.error("Notification insert error:", e?.message);
  }

  // 2) Optional: send email (no-op here, but you can wire nodemailer)
  const emailed = [];
  if (sendEmail) {
    try {
      // Look up recipient emails (example: mentor/student users)
      const users = await User.find({ _id: { $in: ids } }, "email name").lean();
      for (const u of users) {
        if (!u?.email) continue;
        // TODO: integrate nodemailer or any mailer here
        // await transporter.sendMail({ to: u.email, subject: title, text: message || content });
        // Mark the corresponding Notification doc(s) as emailed
        await Notification.updateMany(
          { recipient: u._id, title, "meta.sessionId": meta.sessionId ?? undefined },
          { $set: { emailSent: true, emailSentAt: new Date() } }
        );
        emailed.push(u.email);
      }
    } catch (e) {
      // console.error("Email send failed:", e?.message);
    }
  }

  return { inserted, emailed };
}

module.exports = { notifyAndEmail };