// models/Notification.js
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    // Your PK (string). We'll auto-generate if you don't pass one.
    notification_id: {
      type: String,
      unique: true,
      index: true,
    },

    // Recipient user id (string for compatibility with your table)
    userId: {
      type: String,
      required: true,
      index: true,
    },

    title: { type: String, required: true },

    // "content" in your table (aka message/body)
    content: { type: String, default: "" },

    // Page or route to open (your "pageRelated")
    pageRelated: { type: String, default: "" },

    // unread/read (string FK in your table). We'll default to "unread".
    status: {
      type: String,
      enum: ["unread", "read"],
      default: "unread",
      index: true,
    },

    // Optional: store when read
    readAt: { type: Date, default: null },

    // If the caller sends createdAt as a string, Mongoose will parse it.
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false }
);

// Ensure notification_id is set
NotificationSchema.pre("save", function (next) {
  if (!this.notification_id) {
    // generate a 24-char hex string similar to ObjectId, but as a plain string
    this.notification_id = new mongoose.Types.ObjectId().toString();
  }
  next();
});

module.exports = mongoose.model("Notification", NotificationSchema);