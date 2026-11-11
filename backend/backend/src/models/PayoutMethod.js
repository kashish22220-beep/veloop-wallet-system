const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    methodId: { type: String, required: true, unique: true }, // upi, amazon, google_play, paypal
    name: { type: String, required: true },
    subtitle: { type: String, default: '' },
    badge: { type: String, default: null },
    note: { type: String, default: '' },
    active: { type: Boolean, default: true },
    unavailableReason: { type: String, default: null },
    order: { type: Number, default: 0 },
    // Which details the user must submit; the backend validates against this
    requiredFields: [
      {
        _id: false,
        key: String,
        label: String,
        type: { type: String, default: 'text' },
        pattern: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('PayoutMethod', schema);
