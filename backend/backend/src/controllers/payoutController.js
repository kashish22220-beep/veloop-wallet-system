const PayoutMethod = require('../models/PayoutMethod');
const PayoutOption = require('../models/PayoutOption');
const walletService = require('../services/walletService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const publicMethod = (m) => ({
  method: m.methodId,
  name: m.name,
  subtitle: m.subtitle,
  badge: m.badge,
  note: m.note,
  active: m.active,
  unavailableReason: m.unavailableReason,
  requiredFields: (m.requiredFields || []).map((f) => ({ key: f.key, label: f.label, type: f.type })),
});

const publicOption = (o, user, wallet) => {
  const balance = wallet[o.requiredCurrency] || 0;
  const elig = o.eligibility || {};
  const eligible = user.level >= (elig.minLevel || 0) && !(elig.requireVerified && !user.isVerified);
  return {
    optionId: o.optionId,
    payoutValue: o.payoutValue,
    payoutCurrency: 'INR',
    requiredCurrency: o.requiredCurrency,
    requiredAmount: o.requiredAmount,
    active: o.active,
    eligible,
    userBalance: balance, // for the "0 of 2,400 VEs" progress bar
    canAfford: balance >= o.requiredAmount,
  };
};

// GET /api/payout/methods
exports.getMethods = asyncHandler(async (req, res) => {
  const methods = await PayoutMethod.find().sort({ order: 1 }).lean();
  res.json({ success: true, methods: methods.map(publicMethod) });
});

// GET /api/payout/options  (every method with its options)
exports.getAllOptions = asyncHandler(async (req, res) => {
  const [methods, options, wallet] = await Promise.all([
    PayoutMethod.find().sort({ order: 1 }).lean(),
    PayoutOption.find().sort({ order: 1 }).lean(),
    walletService.getWallet(req.user._id),
  ]);

  res.json({
    success: true,
    methods: methods.map((m) => ({
      ...publicMethod(m),
      options: m.active
        ? options.filter((o) => o.methodId === m.methodId).map((o) => publicOption(o, req.user, wallet))
        : [],
    })),
  });
});

// GET /api/payout/options/:method
exports.getMethodOptions = asyncHandler(async (req, res) => {
  const method = await PayoutMethod.findOne({ methodId: req.params.method }).lean();
  if (!method) throw new AppError(404, 'Payout method not found.', 'METHOD_NOT_FOUND');
  if (!method.active) {
    throw new AppError(400, 'This payout method is currently unavailable.', 'METHOD_UNAVAILABLE');
  }

  const [options, wallet] = await Promise.all([
    PayoutOption.find({ methodId: method.methodId }).sort({ order: 1 }).lean(),
    walletService.getWallet(req.user._id),
  ]);

  res.json({
    success: true,
    method: publicMethod(method),
    options: options.map((o) => publicOption(o, req.user, wallet)),
  });
});
