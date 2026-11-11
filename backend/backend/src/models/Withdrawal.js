const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

// Strategy: Option A. VEs are deducted when the request is created.
// REJECTED / CANCELLED -> a WITHDRAWAL_REFUND credit is added to the ledger.
const schema = new mongoose.Schema(
  {
    withdrawalId: { type: String, required: true, unique: true, default: () => `wd_${randomUUID()}` },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, required: true },
    optionId: { type: String, required: true },
    currency: { type: String, default: 'ves' },
    currencyAmount: { type: Number, required: true }, // VEs taken, from backend config
    payoutAmount: { type: Number, required: true }, // INR value, from backend config
    payoutDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
    },
    rejectionReason: { type: String, default: null },
    reviewNote: { type: String, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    transactionId: { type: String, default: null }, // debit ledger entry
    refundTransactionId: { type: String, default: null },
    idempotencyKey: { type: String, required: true },
    statusHistory: [
      {
        _id: false,
        status: String,
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: String,
      },
    ],
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ transactionId: 1 });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('Withdrawal', schema);
