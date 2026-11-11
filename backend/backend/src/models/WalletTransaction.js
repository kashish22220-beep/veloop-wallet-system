const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { CURRENCY_LIST, CREDIT_SOURCES, DEBIT_SOURCES } = require('../config/constants');

// Append-only ledger. Rows are never updated or deleted by the app.
const schema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true, default: () => `txn_${randomUUID()}` },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currency: { type: String, enum: CURRENCY_LIST, required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    source: { type: String, enum: [...CREDIT_SOURCES, ...DEBIT_SOURCES], required: true },
    referenceId: { type: String, default: null },
    idempotencyKey: { type: String, default: null },
    status: { type: String, enum: ['COMPLETED', 'PENDING', 'FAILED'], default: 'COMPLETED' },
    description: { type: String, default: '', maxlength: 300 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ referenceId: 1 });
schema.index({ status: 1 });
// One idempotency key per user (only enforced when a key is present)
schema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('WalletTransaction', schema);
