const PayoutOption = require('../models/PayoutOption');
const withdrawalService = require('../services/withdrawalService');
const { logAudit } = require('../services/auditService');
const { runInTransaction } = require('../utils/transaction');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/admin/withdrawals?status=PENDING&page=1&limit=20
exports.listWithdrawals = asyncHandler(async (req, res) => {
  const result = await withdrawalService.adminListWithdrawals(req.query);
  res.json({ success: true, ...result });
});

// POST /api/admin/withdrawals/:withdrawalId/status
exports.updateWithdrawalStatus = asyncHandler(async (req, res) => {
  const { status, rejectionReason, reviewNote } = req.body;
  const w = await withdrawalService.changeStatus({
    withdrawalId: req.params.withdrawalId,
    toStatus: status,
    actor: req.user,
    rejectionReason: rejectionReason || null,
    reviewNote: reviewNote || null,
    req,
  });
  res.json({ success: true, withdrawal: withdrawalService.publicWithdrawal(w, { admin: true }) });
});

// PATCH /api/admin/payout/options/:optionId  (change a voucher without redeploying React)
exports.updatePayoutOption = asyncHandler(async (req, res) => {
  const { optionId } = req.params;

  const updated = await runInTransaction(null, async (session) => {
    const before = await PayoutOption.findOne({ optionId }).session(session).lean();
    if (!before) throw new AppError(404, 'Payout option not found.', 'OPTION_NOT_FOUND');

    const after = await PayoutOption.findOneAndUpdate({ optionId }, { $set: req.body }, { new: true, session }).lean();

    await logAudit(
      {
        actorId: req.user._id,
        action: 'PAYOUT_CONFIG_CHANGED',
        targetType: 'PayoutOption',
        referenceId: optionId,
        metadata: {
          before: { active: before.active, requiredAmount: before.requiredAmount, payoutValue: before.payoutValue },
          after: { active: after.active, requiredAmount: after.requiredAmount, payoutValue: after.payoutValue },
        },
        req,
      },
      session
    );
    return after;
  });

  res.json({
    success: true,
    option: {
      optionId: updated.optionId,
      methodId: updated.methodId,
      payoutValue: updated.payoutValue,
      requiredAmount: updated.requiredAmount,
      active: updated.active,
    },
  });
});
