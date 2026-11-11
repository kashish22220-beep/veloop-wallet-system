const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const AppError = require('../utils/AppError');
const { runInTransaction } = require('../utils/transaction');
const {
  CURRENCY_LIST,
  CURRENCY_LABEL,
  CREDIT_SOURCES,
  DEBIT_SOURCES,
  MAX_AMOUNT,
} = require('../config/constants');

/* ------------------------------ validation ------------------------------ */

function assertCurrency(currency) {
  if (!CURRENCY_LIST.includes(currency)) {
    throw new AppError(400, 'Invalid currency.', 'INVALID_CURRENCY');
  }
}

function assertAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new AppError(400, 'Amount must be a positive whole number.', 'INVALID_AMOUNT');
  }
}

/* -------------------------------- helpers ------------------------------- */

function publicTransaction(t) {
  return {
    transactionId: t.transactionId,
    currency: t.currency,
    type: t.type,
    amount: t.amount,
    balanceBefore: t.balanceBefore,
    balanceAfter: t.balanceAfter,
    source: t.source,
    referenceId: t.referenceId,
    status: t.status,
    description: t.description,
    createdAt: t.createdAt,
  };
}

function publicWallet(w) {
  return {
    ves: w.ves,
    sves: w.sves,
    gems: w.gems,
    tokens: w.tokens,
    spins: w.spins,
    updatedAt: w.updatedAt,
  };
}

function findByIdempotencyKey(userId, key, session) {
  if (!key) return null;
  return WalletTransaction.findOne({ userId, idempotencyKey: key }).session(session || null).lean();
}

/* ------------------------------ ledger entry ----------------------------- */

async function createLedgerEntry(entry, session) {
  const [doc] = await WalletTransaction.create([entry], { session });
  return doc;
}

/* ----------------------------- read operations --------------------------- */

async function getWallet(userId, session = null) {
  const wallet = await Wallet.findOne({ userId }).session(session).lean();
  if (!wallet) throw new AppError(404, 'Wallet not found.', 'WALLET_NOT_FOUND');
  return wallet;
}

async function getTransactions(userId, { page = 1, limit = 20, currency, type } = {}) {
  const filter = { userId };
  if (currency) filter.currency = currency;
  if (type) filter.type = type;

  const [rows, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WalletTransaction.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    transactions: rows.map(publicTransaction),
  };
}

/**
 * Advisory check only (e.g. to show a friendly message early).
 * debitWallet() re-checks atomically, so this is never the real guard.
 */
async function validateBalance(userId, currency, amount, session = null) {
  assertCurrency(currency);
  assertAmount(amount);
  const wallet = await getWallet(userId, session);
  return { sufficient: wallet[currency] >= amount, balance: wallet[currency] };
}

/* --------------------------- write operations ---------------------------- */

/**
 * Shared implementation for credit and debit.
 * - Balance change is ONE atomic findOneAndUpdate.
 * - Ledger row is written in the same transaction.
 * - An idempotencyKey makes retries / double-clicks return the original result.
 */
async function applyChange(direction, params, session) {
  const {
    userId,
    currency,
    amount,
    source,
    referenceId = null,
    description = '',
    metadata = {},
    idempotencyKey = null,
  } = params;

  assertCurrency(currency);
  assertAmount(amount);
  const allowed = direction === 'CREDIT' ? CREDIT_SOURCES : DEBIT_SOURCES;
  if (!allowed.includes(source)) {
    throw new AppError(400, 'Invalid transaction source.', 'INVALID_SOURCE');
  }

  try {
    return await runInTransaction(session, async (s) => {
      const existing = await findByIdempotencyKey(userId, idempotencyKey, s);
      if (existing) return { transaction: existing, duplicate: true };

      let wallet;
      if (direction === 'CREDIT') {
        const inc = { [currency]: amount };
        if (currency === 'ves' && source !== 'WITHDRAWAL_REFUND') inc.lifetimeVesEarned = amount;
        wallet = await Wallet.findOneAndUpdate({ userId }, { $inc: inc }, { new: true, session: s });
        if (!wallet) throw new AppError(404, 'Wallet not found.', 'WALLET_NOT_FOUND');
      } else {
        // The balance check lives INSIDE the update filter, so check + deduct is one atomic step.
        wallet = await Wallet.findOneAndUpdate(
          { userId, [currency]: { $gte: amount } },
          { $inc: { [currency]: -amount } },
          { new: true, session: s }
        );
        if (!wallet) {
          const exists = await Wallet.exists({ userId }).session(s);
          if (!exists) throw new AppError(404, 'Wallet not found.', 'WALLET_NOT_FOUND');
          throw new AppError(400, `Insufficient ${CURRENCY_LABEL[currency]} balance.`, 'INSUFFICIENT_BALANCE');
        }
      }

      const balanceAfter = wallet[currency];
      const balanceBefore = direction === 'CREDIT' ? balanceAfter - amount : balanceAfter + amount;

      const transaction = await createLedgerEntry(
        {
          userId,
          currency,
          type: direction,
          amount,
          balanceBefore,
          balanceAfter,
          source,
          referenceId,
          idempotencyKey,
          description,
          metadata,
        },
        s
      );

      return { transaction, wallet, duplicate: false };
    });
  } catch (err) {
    // Unique-index backstop for two identical requests racing each other
    if (!session && err.code === 11000 && idempotencyKey) {
      const existing = await findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return { transaction: existing, duplicate: true };
    }
    throw err;
  }
}

const creditWallet = (params, session = null) => applyChange('CREDIT', params, session);
const debitWallet = (params, session = null) => applyChange('DEBIT', params, session);

module.exports = {
  creditWallet,
  debitWallet,
  getWallet,
  getTransactions,
  validateBalance,
  createLedgerEntry,
  publicWallet,
  publicTransaction,
};
