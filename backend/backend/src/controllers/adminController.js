const User = require('../models/User');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const PayoutMethod = require('../models/PayoutMethod');
const Withdrawal = require('../models/Withdrawal');
const PayoutOption = require('../models/PayoutOption');
const withdrawalService = require('../services/withdrawalService');
const { logAudit } = require('../services/auditService');
const { runInTransaction } = require('../utils/transaction');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const walletFields = ['ves', 'sves', 'gems', 'tokens', 'spins'];

const publicAdminUser = (user, wallet) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus,
  isVerified: user.isVerified,
  level: user.level,
  createdAt: user.createdAt,
  wallet: wallet
    ? Object.fromEntries(walletFields.map((field) => [field, wallet[field] || 0]))
    : Object.fromEntries(walletFields.map((field) => [field, 0])),
});

exports.overview = asyncHandler(async (req, res) => {
  const [users, activeUsers, pendingWithdrawals, transactions, wallets] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ accountStatus: 'active' }),
    Withdrawal.countDocuments({ status: { $in: ['PENDING', 'PROCESSING'] } }),
    WalletTransaction.countDocuments(),
    Wallet.aggregate([
      { $group: { _id: null, ves: { $sum: '$ves' }, sves: { $sum: '$sves' }, gems: { $sum: '$gems' }, tokens: { $sum: '$tokens' }, spins: { $sum: '$spins' } } },
    ]),
  ]);
  res.json({
    success: true,
    overview: {
      users,
      activeUsers,
      pendingWithdrawals,
      transactions,
      balances: wallets[0] || { ves: 0, sves: 0, gems: 0, tokens: 0, spins: 0 },
    },
  });
});

exports.listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const filter = {};
  if (status) filter.accountStatus = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const wallets = await Wallet.find({ userId: { $in: users.map((user) => user._id) } }).lean();
  const walletByUser = new Map(wallets.map((wallet) => [wallet.userId.toString(), wallet]));
  res.json({
    success: true,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    users: users.map((user) => publicAdminUser(user, walletByUser.get(user._id.toString()))),
  });
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  if (req.params.userId === req.user._id.toString()) {
    throw new AppError(400, 'You cannot change your own account status.', 'SELF_STATUS_CHANGE');
  }
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { $set: { accountStatus: req.body.accountStatus } },
    { new: true, runValidators: true }
  ).lean();
  if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  const wallet = await Wallet.findOne({ userId: user._id }).lean();
  res.json({ success: true, user: publicAdminUser(user, wallet) });
});

exports.listTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, currency } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (currency) filter.currency = currency;
  const [rows, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'name email')
      .lean(),
    WalletTransaction.countDocuments(filter),
  ]);
  res.json({
    success: true,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    transactions: rows.map((row) => {
      const { userId, ...transaction } = row;
      return {
        ...transaction,
        user: userId ? { id: userId._id, name: userId.name, email: userId.email } : null,
      };
    }),
  });
});

exports.listPayouts = asyncHandler(async (req, res) => {
  const [methods, options] = await Promise.all([
    PayoutMethod.find().sort({ order: 1 }).lean(),
    PayoutOption.find().sort({ order: 1 }).lean(),
  ]);
  res.json({
    success: true,
    methods: methods.map(({ methodId, name, subtitle, active, requiredFields }) => ({ methodId, name, subtitle, active, requiredFields })),
    options: options.map(({ optionId, methodId, payoutValue, requiredCurrency, requiredAmount, active, eligibility }) => ({
      optionId, methodId, payoutValue, requiredCurrency, requiredAmount, active, eligibility,
    })),
  });
});

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
