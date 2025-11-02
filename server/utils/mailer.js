// utils/mailer.js
const nodemailer = require("nodemailer");

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const port = Number(process.env.SMTP_PORT || 587);
const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true"; // 465 if true
const user = String(process.env.SMTP_USER || "").trim();
const pass = String(process.env.SMTP_PASS || "").trim();
const from = String(process.env.SMTP_FROM || user).trim();

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: user && pass ? { user, pass } : undefined,
  requireTLS: !secure,
  logger: true,
  debug: true,
});

async function verifyTransport() {
  try {
    await transporter.verify();
    console.log("[mailer] SMTP ready:", { host, port, secure });
  } catch (err) {
    console.error("[mailer] SMTP verify failed:", err.message);
  }
}
verifyTransport();

async function sendMail({ to, subject, text, html }) {
  return transporter.sendMail({ from, to, subject, text, html });
}

module.exports = { sendMail };