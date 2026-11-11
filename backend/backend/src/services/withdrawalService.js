const { randomUUID } = require('crypto');
const Withdrawal = require('../models/Withdrawal');
const PayoutMethod = require('../models/PayoutMethod');
const PayoutOption = require('../models/PayoutOption');
const walletService = require('./walletService');
const { logAudit } = require('./auditService');
const { runInTransaction } = require('../utils/transaction');
const AppError = require('../utils/AppError');
const { MAX_PENDING_WITHDRAWALS, WITHDRAWAL_TRANSITIONS } = require('../config/constants');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const FINAL_REFUND_STATUSES = ['REJECTED', 'CANCELLED'];

const AUDIT_ACTION = {
  PROCESSING: 'WITHDRAWAL_PROCESSING',
  APPROVED: 'WITHDRAWAL_APPROVED',
  REJECTED: 'WITHDRAWAL_REJECTED',
  CANCELLED: 'WITHDRAWAL_CANCELLED',
};

/* ------------------------------- formatting ------------------------------ */

function publicWithdrawal(w, { admin = false } = {}) {
  const out = {
    withdrawalId: w.withdrawalId,
    method: w.method,
    optionId: w.optionId,
    currency: w.currency,
    currencyAmount: w.currencyAmount,
    payoutAmount: w.payoutAmount,
    payoutDetails: w.payoutDetails,
    status: w.status,
    rejectionReason: w.rejectionReason,
    transactionId: w.transactionId,
    refundTransactionId: w.refundTransactionId,
    statusHistory: (w.statusHistory || []).map((h) => ({ status: h.status, at: h.at, note: h.note })),
    requestedAt: w.requestedAt,
    processedAt: w.processedAt,
    updatedAt: w.updatedAt,
  };
  if (admin) {
    out.reviewNote = w.reviewNote;
    const u = w.userId;
    out.user = u && u.email ? { id: u._id, name: u.name, email: u.email } : { id: u };
  }
  return out;
}

/* -------------------------- payout detail validation --------------------- */

// Checks the submitted details against what the METHOD requires (from the database).
function validatePayoutDetails(method, details) {
  const fields = method.requiredFields || [];
  const allowed = fields.map((f) => f.key);

  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    throw new AppError(400, 'Payout details are required.', 'INVALID_PAYOUT_DETAILS');
  }
  const extra = Object.keys(details).filter((k) => !allowed.includes(k));
  if (extra.length) {
    throw new AppError(400, 'Unexpected payout details submitted.', 'INVALID_PAYOUT_DETAILS');
  }

  const clean = {};
  for (const f of fields) {
    const raw = details[f.key];
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new AppError(400, `${f.label} is required.`, 'INVALID_PAYOUT_DETAILS');
    }
    const value = raw.trim();
    if (f.type === 'email' && !EMAIL_RE.test(value)) {
      throw new AppError(400, `Enter a valid ${f.label}.`, 'INVALID_PAYOUT_DETAILS');
    }
    if (f.pattern && !new RegExp(f.pattern).test(value)) {
      throw new AppError(400, `Enter a valid ${f.label}.`, 'INVALID_PAYOUT_DETAILS');
    }
    clean[f.key] = value;
  }
  return clean;
}

/* ------------------------------ create request --------------------------- */

/**
 * ONE transaction does all of this, or none of it:
 *   look up real option -> validate -> atomic VEs deduction + ledger row
 *   -> create Withdrawal (PENDING) -> audit log
 * Strategy (Option A): VEs are deducted immediately; a rejection/cancel refunds them.
 */
async function createWithdrawal({ user, method: methodId, optionId, payoutDetails, idempotencyKey, req }) {
  const userId = user._id;

  try {
    return await runInTransaction(null, async (session) => {
      // Same key again (double-click / retry) -> no second deduction
      const existing = await Withdrawal.findOne({ userId, idempotencyKey }).session(session);
      if (existing) return { withdrawal: existing, duplicate: true };

      const method = await PayoutMethod.findOne({ methodId }).session(session).lean();
      if (!method || !method.active) {
        throw new AppError(400, 'This payout method is currently unavailable.', 'METHOD_UNAVAILABLE');
      }

      const option = await PayoutOption.findOne({ optionId, methodId }).session(session).lean();
      if (!option || !option.active) {
        throw new AppError(400, 'Selected payout option is unavailable.', 'OPTION_UNAVAILABLE');
      }

      const elig = option.eligibility || {};
      if (user.level < (elig.minLevel || 0) || (elig.requireVerified && !user.isVerified)) {
        throw new AppError(403, 'You are not eligible for this payout option.', 'NOT_ELIGIBLE');
      }

      const details = validatePayoutDetails(method, payoutDetails);

      const open = await Withdrawal.countDocuments({
        userId,
        status: { $in: ['PENDING', 'PROCESSING'] },
      }).session(session);
      if (open >= MAX_PENDING_WITHDRAWALS) {
        throw new AppError(403, 'This request requires additional verification.', 'VERIFICATION_REQUIRED');
      }

      const withdrawalId = `wd_${randomUUID()}`;

      // The amount comes from the DATABASE option, never from the client
      const debit = await walletService.debitWallet(
        {
          userId,
          currency: option.requiredCurrency,
          amount: option.requiredAmount,
          source: 'WITHDRAWAL',
          referenceId: withdrawalId,
          idempotencyKey: `wd:${idempotencyKey}`,
          description: `${method.name} Withdrawal (₹${option.payoutValue})`,
          metadata: { method: methodId, optionId, payoutValue: option.payoutValue },
        },
        session
      );
      if (debit.duplicate) {
        throw new AppError(409, 'This withdrawal request has already been submitted.', 'DUPLICATE_WITHDRAWAL');
      }

      const [withdrawal] = await Withdrawal.create(
        [
          {
            withdrawalId,
            userId,
            method: methodId,
            optionId,
            currency: option.requiredCurrency,
            currencyAmount: option.requiredAmount,
            payoutAmount: option.payoutValue,
            payoutDetails: details,
            status: 'PENDING',
            transactionId: debit.transaction.transactionId,
            idempotencyKey,
            statusHistory: [{ status: 'PENDING', by: userId, note: 'Withdrawal requested' }],
          },
        ],
        { session }
      );

      await logAudit(
        {
          actorId: userId,
          action: 'WITHDRAWAL_CREATED',
          targetUserId: userId,
          targetType: 'Withdrawal',
          referenceId: withdrawalId,
          metadata: {
            method: methodId,
            optionId,
            currencyAmount: option.requiredAmount,
            payoutAmount: option.payoutValue,
            transactionId: debit.transaction.transactionId,
          },
          req,
        },
        session
      );

      return { withdrawal, wallet: debit.wallet, duplicate: false };
    });
  } catch (err) {
    // Unique-index backstop for two identical requests racing each other
    if (err.code === 11000) {
      const existing = await Withdrawal.findOne({ userId, idempotencyKey });
      if (existing) return { withdrawal: existing, duplicate: true };
    }
    throw err;
  }
}

/* ------------------------------ status changes --------------------------- */

/**
 * Moves a withdrawal to a new status (admin review, or the owner cancelling).
 * - The transition rules live in WITHDRAWAL_TRANSITIONS.
 * - REJECTED / CANCELLED give the VEs back with a WITHDRAWAL_REFUND ledger credit.
 * - The final update is conditional on the old status, so a refund can never happen twice.
 */
async function changeStatus({ withdrawalId, ownerId = null, toStatus, actor, rejectionReason = null, reviewNote = null, req }) {
  return runInTransaction(null, async (session) => {
    const filter = { withdrawalId };
    if (ownerId) filter.userId = ownerId; // users can only touch their own

    const current = await Withdrawal.findOne(filter).session(session);
    if (!current) throw new AppError(404, 'Withdrawal not found.', 'WITHDRAWAL_NOT_FOUND');

    if (!WITHDRAWAL_TRANSITIONS[current.status].includes(toStatus)) {
      throw new AppError(
        409,
        `A ${current.status.toLowerCase()} withdrawal cannot be changed to ${toStatus.toLowerCase()}.`,
        'INVALID_TRANSITION'
      );
    }

    const set = { status: toStatus };
    if (actor.role === 'admin') set.reviewedBy = actor._id;
    if (reviewNote) set.reviewNote = reviewNote;
    if (toStatus === 'REJECTED') set.rejectionReason = rejectionReason;
    if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(toStatus)) set.processedAt = new Date();

    if (FINAL_REFUND_STATUSES.includes(toStatus)) {
      const refund = await walletService.creditWallet(
        {
          userId: current.userId,
          currency: current.currency,
          amount: current.currencyAmount,
          source: 'WITHDRAWAL_REFUND',
          referenceId: current.withdrawalId,
          idempotencyKey: `wd-refund:${current.withdrawalId}`,
          description: `Refund: ${current.method} withdrawal ${toStatus.toLowerCase()}`,
          metadata: { withdrawalId: current.withdrawalId, originalTransactionId: current.transactionId },
        },
        session
      );
      set.refundTransactionId = refund.transaction.transactionId;
    }

    const updated = await Withdrawal.findOneAndUpdate(
      { _id: current._id, status: current.status },
      {
        $set: set,
        $push: {
          statusHistory: {
            status: toStatus,
            at: new Date(),
            by: actor._id,
            note: rejectionReason || reviewNote || null,
          },
        },
      },
      { new: true, session }
    );
    if (!updated) {
      throw new AppError(409, 'This withdrawal was just updated. Please refresh.', 'CONFLICT');
    }

    await logAudit(
      {
        actorId: actor._id,
        action: AUDIT_ACTION[toStatus],
        targetUserId: current.userId,
        targetType: 'Withdrawal',
        referenceId: current.withdrawalId,
        metadata: {
          from: current.status,
          to: toStatus,
          rejectionReason,
          reviewNote,
          refundTransactionId: set.refundTransactionId || null,
        },
        req,
      },
      session
    );

    return updated;
  });
}

// Users can cancel only their own PENDING withdrawal (the transition rules enforce this)
const cancelWithdrawal = ({ user, withdrawalId, req }) =>
  changeStatus({
    withdrawalId,
    ownerId: user._id,
    toStatus: 'CANCELLED',
    actor: user,
    reviewNote: 'Cancelled by user',
    req,
  });

/* --------------------------------- queries ------------------------------- */

async function listWithdrawals(userId, { page = 1, limit = 20, status } = {}) {
  const filter = { userId };
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    Withdrawal.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Withdrawal.countDocuments(filter),
  ]);
  return { page, limit, total, totalPages: Math.ceil(total / limit), withdrawals: rows.map((w) => publicWithdrawal(w)) };
}

async function getWithdrawal(userId, withdrawalId) {
  // Scoped to the owner: someone else's id looks exactly like "not found"
  const w = await Withdrawal.findOne({ withdrawalId, userId }).lean();
  if (!w) throw new AppError(404, 'Withdrawal not found.', 'WITHDRAWAL_NOT_FOUND');
  return publicWithdrawal(w);
}

async function adminListWithdrawals({ page = 1, limit = 20, status } = {}) {
  const filter = {};
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    Withdrawal.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'name email')
      .lean(),
    Withdrawal.countDocuments(filter),
  ]);
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    withdrawals: rows.map((w) => publicWithdrawal(w, { admin: true })),
  };
}

module.exports = {
  createWithdrawal,
  changeStatus,
  cancelWithdrawal,
  listWithdrawals,
  getWithdrawal,
  adminListWithdrawals,
  publicWithdrawal,
};
