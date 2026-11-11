const rateLimit = require('express-rate-limit');

const handler = (message) => (req, res) =>
  res.status(429).json({ success: false, message, code: 'RATE_LIMITED' });

// Login / register: per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many attempts. Please try again later.'),
});

// Wallet mutations (admin credit/debit, admin reviews): per authenticated user (use AFTER authenticate)
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id),
  handler: handler('Too many requests. Please slow down.'),
});

// Withdrawal requests: stricter, per authenticated user
const withdrawalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id),
  handler: handler('Too many withdrawal requests. Please wait a minute and try again.'),
});

// General API limiter: per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many requests. Please slow down.'),
});

module.exports = { authLimiter, mutationLimiter, withdrawalLimiter, apiLimiter };
