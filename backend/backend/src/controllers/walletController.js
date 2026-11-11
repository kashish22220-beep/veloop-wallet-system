const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const walletService = require('../services/walletService');
const { logAudit } = require('../services/auditService');
const { runInTransaction } = require('../utils/transaction');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ESTIMATE_VES_PER_INR } = require('../config/constants');

const toInr = (ves) => Math.floor((ves / ESTIMATE_VES_PER_INR) * 100) / 100;

// GET /api/wallet  (the user comes from the JWT, never from the request)
exports.getWallet = asyncHandler(async (req, res) => {
  const wallet = await walletService.getWallet(req.user._id);
  res.json({ success: true, wallet: walletService.publicWallet(wallet) });
});

// GET /api/wallet/summary
exports.getSummary = asyncHandler(async (req, res) => {
  const wallet = await walletService.getWallet(req.user._id);

  const [withdrawn] = await Withdrawal.aggregate([
    { $match: { userId: req.user._id, status: 'APPROVED' } },
    { $group: { _id: null, total: { $sum: '$payoutAmount' } } },
  ]);

  res.json({
    success: true,
    summary: {
      wallet: walletService.publicWallet(wallet),
      isVerified: req.user.isVerified,
      level: req.user.level,
      currentVesValueInr: toInr(wallet.ves),
      lifetimeInr: toInr(wallet.lifetimeVesEarned),
      withdrawnInr: withdrawn ? withdrawn.total : 0,
    },
  });
});

// GET /api/wallet/transactions?page=1&limit=20
exports.getTransactions = asyncHandler(async (req, res) => {
  const result = await walletService.getTransactions(req.user._id, req.query);
  res.json({ success: true, ...result });
});

// Shared by the two admin-only mutation endpoints
const adminChange = (direction) =>
  asyncHandler(async (req, res) => {
    const { userId, currency, amount, source, description, idempotencyKey } = req.body;

    const target = await User.exists({ _id: userId });
    if (!target) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');

    const result = await runInTransaction(null, async (session) => {
      const fn = direction === 'CREDIT' ? walletService.creditWallet : walletService.debitWallet;
      const out = await fn(
        {
          userId,
          currency,
          amount,
          source,
          description,
          idempotencyKey,
          metadata: { actorId: req.user._id.toString() },
        },
        session
      );

      // Audit entry commits together with the balance change
      if (!out.duplicate) {
        await logAudit(
          {
            actorId: req.user._id,
            action: direction === 'CREDIT' ? 'WALLET_CREDIT' : 'WALLET_DEBIT',
            targetUserId: userId,
            targetType: 'Wallet',
            referenceId: out.transaction.transactionId,
            metadata: { currency, amount, source, description },
            req,
          },
          session
        );
      }
      return out;
    });

    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      transaction: walletService.publicTransaction(result.transaction),
    });
  });

exports.adminCredit = adminChange('CREDIT');
exports.adminDebit = adminChange('DEBIT');
