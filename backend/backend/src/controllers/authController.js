const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { runInTransaction } = require('../utils/transaction');

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  isVerified: u.isVerified,
  level: u.level,
});

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (await User.exists({ email })) {
    throw new AppError(409, 'An account with this email already exists.', 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // User and empty wallet are created together or not at all
  const user = await runInTransaction(null, async (session) => {
    const [u] = await User.create([{ name, email, passwordHash }], { session });
    await Wallet.create([{ userId: u._id }], { session });
    return u;
  });

  res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');

  if (user.accountStatus !== 'active') {
    throw new AppError(403, 'Your account is not active.', 'ACCOUNT_INACTIVE');
  }

  res.json({ success: true, token: signToken(user), user: publicUser(user) });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});
exports.googleSuccess = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!user || user.accountStatus !== 'active') {
    throw new AppError(
      401,
      'Google authentication failed.',
      'GOOGLE_AUTH_FAILED'
    );
  }

  const token = signToken(user);

  const frontendURL =
    process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  res.redirect(
    `${frontendURL}/auth/google/success#token=${encodeURIComponent(token)}`
  );
});