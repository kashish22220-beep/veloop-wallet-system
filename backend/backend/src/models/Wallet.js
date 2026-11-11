const mongoose = require('mongoose');

const balance = { type: Number, default: 0, min: 0, validate: Number.isSafeInteger };

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    ves: balance,
    sves: balance,
    gems: balance,
    tokens: balance,
    spins: balance,
    // Running total of VEs ever earned (shown as "Lifetime" on the Wallet page)
    lifetimeVesEarned: balance,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
