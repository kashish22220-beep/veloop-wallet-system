
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },

    passwordHash: { type: String, required: false, select: false },

    googleId: { type: String, unique: true, sparse: true },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    accountStatus: { type: String, enum: ['active', 'suspended', 'blocked'], default: 'active' },
    isVerified: { type: Boolean, default: false },
    level: { type: Number, default: 0, min: 0 },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
