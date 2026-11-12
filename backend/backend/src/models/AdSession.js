const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const schema = new mongoose.Schema(
  {
    sessionId: { type: String, unique: true, default: () => randomUUID() },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    transactionId: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('AdSession', schema);
