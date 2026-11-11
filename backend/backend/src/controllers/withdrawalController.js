const withdrawalService = require('../services/withdrawalService');
const walletService = require('../services/walletService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

// The frontend generates ONE key per confirmation and re-sends the same key on retry/double-click.
function getIdempotencyKey(req) {
  const key = req.get('Idempotency-Key');
  if (!key || !KEY_RE.test(key)) {
    throw new AppError(400, 'A valid Idempotency-Key header is required.', 'IDEMPOTENCY_KEY_REQUIRED');
  }
  return key;
}

// POST /api/withdrawals
exports.create = asyncHandler(async (req, res) => {
  const idempotencyKey = getIdempotencyKey(req);
  const { method, optionId, payoutDetails } = req.body;

  const result = await withdrawalService.createWithdrawal({
    user: req.user,
    method,
    optionId,
    payoutDetails,
    idempotencyKey,
    req,
  });

  if (result.duplicate) {
    return res.status(409).json({
      success: false,
      message: 'This withdrawal request has already been submitted.',
      code: 'DUPLICATE_WITHDRAWAL',
      withdrawal: withdrawalService.publicWithdrawal(result.withdrawal),
    });
  }

  res.status(201).json({
    success: true,
    message: 'Withdrawal submitted successfully.',
    withdrawal: withdrawalService.publicWithdrawal(result.withdrawal),
    wallet: walletService.publicWallet(result.wallet),
  });
});

// GET /api/withdrawals
exports.list = asyncHandler(async (req, res) => {
  const result = await withdrawalService.listWithdrawals(req.user._id, req.query);
  res.json({ success: true, ...result });
});

// GET /api/withdrawals/:withdrawalId
exports.get = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.getWithdrawal(req.user._id, req.params.withdrawalId);
  res.json({ success: true, withdrawal });
});

// POST /api/withdrawals/:withdrawalId/cancel
exports.cancel = asyncHandler(async (req, res) => {
  const w = await withdrawalService.cancelWithdrawal({
    user: req.user,
    withdrawalId: req.params.withdrawalId,
    req,
  });
  const wallet = await walletService.getWallet(req.user._id);
  res.json({
    success: true,
    message: 'Withdrawal cancelled and VEs returned.',
    withdrawal: withdrawalService.publicWithdrawal(w),
    wallet: walletService.publicWallet(wallet),
  });
});
