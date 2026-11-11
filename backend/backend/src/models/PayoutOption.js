const mongoose = require('mongoose');

// One redeemable voucher, e.g. upi_100 -> Rs 100 for 19,500 VEs
const schema = new mongoose.Schema(
  {
    optionId: { type: String, required: true, unique: true },
    methodId: { type: String, required: true },
    payoutValue: { type: Number, required: true, min: 1 }, // in INR
    requiredCurrency: { type: String, default: 'ves' },
    requiredAmount: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    eligibility: {
      minLevel: { type: Number, default: 0 },
      requireVerified: { type: Boolean, default: false },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

schema.index({ methodId: 1, active: 1, order: 1 });

module.exports = mongoose.model('PayoutOption', schema);
