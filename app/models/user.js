
import mongoose from "mongoose";

const UserSchema = mongoose.Schema({
  name: String,
  email: String,
  password: { type: String, select: false },
  role: String,
  avatarUrl: String,
  location: String,
  bio: String,
  isOnline: Boolean,
  country: String,
  phoneNumber: String,

  // 2FA Fields
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  backupCodes: [{ type: String, select: false }],

  // Trusted Devices
  trustedDevices: [
    {
      deviceId: String,
      deviceName: String,
      browser: String,
      os: String,
      lastUsed: { type: Date, default: Date.now },
      location: String,
      ipAddress: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],

  // Security preferences
  securitySettings: {
    require2FAForNewDevices: { type: Boolean, default: true },
    rememberTrustedDevices: { type: Boolean, default: true },
    sessionDuration: { type: Number, default: 30 }, // days
  },
    // Email OTP verification
  otpVerified: { type: Boolean, default: false },

  // Account Approval Fields
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: function () {
      // Admin doesn't need approval
      if (this.role === "admin") return "approved";
      // Entrepreneur and investor need approval
      if (this.role === "entrepreneur" || this.role === "investor")
        return "pending";
      // Others are auto-approved
      return "approved";
    },
  },
  rejectionReason: String,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvalDate: Date,

  // Suspension Fields
  isSuspended: { type: Boolean, default: false },
  suspensionReason: String,
  suspensionStartDate: Date,
  suspensionEndDate: Date,
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  suspensionCount: { type: Number, default: 0 },

  // Blocking Fields
  isBlocked: { type: Boolean, default: false },
  blockReason: String,
  blockedAt: Date,
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // KYC / Legal verification
  kycStatus: {
    status: {
      type: String,
      enum: ["unsubmitted", "pending", "verified", "rejected"],
      default: "unsubmitted",
    },
    note: String,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },

  createdAt: { type: Date, default: Date.now },
  // Push subscription for web push
  pushSubscription: { type: Object, default: null },
});

UserSchema.methods.safeDataForAuth = function () {
  return {
    userId: this._id,
    email: this.email,
    role: this.role,
    name: this.name,
    twoFactorEnabled: this.twoFactorEnabled,
  };
};

UserSchema.methods.afterLoggedSafeData = function () {
  const userObj = this.toObject();
  userObj.userId = this._id;
  delete userObj.password;
  delete userObj.twoFactorSecret;
  delete userObj.backupCodes;
  delete userObj.__v;
  delete userObj._id;
  return userObj;
};

UserSchema.methods.afterLoggedSafeDataForOauth = function () {
  const userObj = this.toObject();
  userObj.userId = this._id;
  delete userObj.__v;
  delete userObj._id;
  delete userObj.twoFactorSecret;
  delete userObj.backupCodes;
  return userObj;
};

// Method to check if device is trusted
UserSchema.methods.isDeviceTrusted = function (deviceId) {
  if (!this.trustedDevices || this.trustedDevices.length === 0) return false;

  const trustedDevice = this.trustedDevices.find(
    (device) => device.deviceId === deviceId
  );

  if (!trustedDevice) return false;

  // Check if the trusted device session is still valid
  const sessionDuration = this.securitySettings.sessionDuration || 30;
  const expirationDate = new Date(trustedDevice.lastUsed);
  expirationDate.setDate(expirationDate.getDate() + sessionDuration);

  return new Date() <= expirationDate;
};

// Method to add trusted device
UserSchema.methods.addTrustedDevice = function (deviceData) {
  // Remove existing device with same ID if exists
  this.trustedDevices = this.trustedDevices.filter(
    (device) => device.deviceId !== deviceData.deviceId
  );

  // Add new trusted device (limit to 10 devices)
  if (this.trustedDevices.length >= 10) {
    this.trustedDevices.shift(); // Remove oldest device
  }

  this.trustedDevices.push({
    ...deviceData,
    lastUsed: new Date(),
  });
};

const User = mongoose.model("User", UserSchema);
export default User;
