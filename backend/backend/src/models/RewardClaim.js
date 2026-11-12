const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['DAILY_REWARD', 'AD_REWARD', 'BONUS', 'REFERRAL_SENT', 'REFERRAL_RECEIVED'],
      required: true,
    },
    claimKey: { type: String, required: true },
    amount: { type: Number, required: true },
    streakDay: { type: Number, default: null },
    referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

schema.index({ userId: 1, type: 1, claimKey: 1 }, { unique: true });
schema.index({ userId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('RewardClaim', schema);
