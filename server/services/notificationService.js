// server/services/notificationService.js
const { sendMail } = require("../utils/mailer");
const Notification = require("../models/Notification"); 
const User = require("../models/User");           

// Prefer explicit app base; fall back to common envs and dev default
const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  "http://localhost:3000";

function toAbsoluteUrl(link) {
  if (!link) return APP_BASE_URL;
  if (/^https?:\/\//i.test(link)) return link;
  const a = APP_BASE_URL.replace(/\/+$/, "");
  const b = String(link).startsWith("/") ? link : `/${link}`;
  return `${a}${b}`;
}

function renderEmailHTML({ title, message, link, type }, user) {
  const url = toAbsoluteUrl(link || "/");
  const chip =
    type === "feedback" ? "My Feedback" :
    type === "notes"    ? "Session Notes" :
    "My Schedule";

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <div style="font-weight:700;font-size:18px;margin-bottom:8px;">${title || "MentEase update"}</div>
    <div style="display:inline-block;padding:3px 8px;border-radius:999px;background:#eef2f7;color:#334155;font-size:12px;margin-bottom:12px;">
      ${chip}
    </div>
    <p style="line-height:1.6;white-space:pre-wrap;margin:12px 0;">${message || ""}</p>
    <p>
      <a href="${url}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#0b3b8a;color:#fff;text-decoration:none">
        Open in MentEase
      </a>
    </p>
    <p style="color:#64748b;font-size:12px;margin-top:24px;">You’re receiving this because email alerts are enabled for your account.</p>
  </div>`;
}

function renderEmailText({ title, message, link }) {
  const url = toAbsoluteUrl(link || "/");
  return `${title || "MentEase update"}\n\n${message || ""}\n\nOpen: ${url}`;
}


async function findUserByIdOrEmail(recipientId, recipientEmail) {
  // 1) Try direct User ID
  if (recipientId) {
    try {
      const u = await User.findById(recipientId).lean();
      if (u) return u;
    } catch {}
  }
  // 2) Try email (case-insensitive)
  if (recipientEmail) {
    const email = String(recipientEmail).toLowerCase().trim();
    if (email) {
      const u = await User.findOne({ email }).lean();
      if (u) return u;
    }
  }
  return null;
}

/**
 * Creates a DB notification and (optionally) emails the recipient.
 * @param {{
 *  recipientId: string,
 *  type?: "session"|"feedback"|"notes"|string,
 *  title?: string,
 *  message?: string,
 *  link?: string,
 *  sendEmail?: boolean,
 *  // extras to preserve in DB
 *  content?: string,
 *  pageRelated?: string,
 *  meta?: object
 * }} payload
 */
async function createNotificationAndMaybeEmail(payload) {
  const {
    recipientId,
    recipientEmail,
    type = "session",
    title = "Update",
    message = "",
    link = "/",
    sendEmail = true,
    content = "",
    pageRelated = "",
    meta = {},
  } = payload || {};

  // Resolve the effective User record from either ID or email
  const user = await findUserByIdOrEmail(recipientId, recipientEmail);
  if (!user) {
    throw new Error("Valid recipient (user) not found by id or email");
  }
  const effectiveRecipientId = String(user._id);

  // 1) Save in DB (so your UI can list it)
  const doc = await Notification.create({
    recipient: effectiveRecipientId,
    type,
    title,
    message,
    link,
    content,
    pageRelated,
    meta,
    read: false,
    emailSent: false,
  });

  // 2) Email (best-effort; don't block UI if it fails)
  const globallyDisabled =
    String(process.env.EMAIL_NOTIFICATIONS_DISABLED || "").toLowerCase() === "true";
  if (sendEmail && !globallyDisabled) {
    try {
      const to = user?.email;
      if (to) {
        const html = renderEmailHTML({ title, message, link, type }, user);
        const text = renderEmailText({ title, message, link });
        await sendMail({
          to,
          subject: `[MentEase] ${title}`,
          html,
          text,
        });
        await Notification.updateOne(
          { _id: doc._id },
          { $set: { emailSent: true, emailSentAt: new Date() } }
        );
      } else {
        // no email address found; leave emailSent=false
        if (process.env.NODE_ENV !== "production") {
          console.warn("Notification email skipped: user has no email", {
            recipientId: effectiveRecipientId,
          });
        }
      }
    } catch (err) {
      // log only; UI still shows in-app notification
      console.error("Email notification failed:", err?.message || err);
    }
  }

  // Return the fresh doc (with emailSent potentially updated)
  const saved = await Notification.findById(doc._id).lean();
  return saved || doc.toObject?.() || doc;
}

module.exports = { createNotificationAndMaybeEmail };