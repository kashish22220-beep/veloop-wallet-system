const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// The user is ALWAYS identified from the verified token, never from query/body.
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Authentication required.', 'AUTH_REQUIRED');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'Authentication required.', 'AUTH_REQUIRED');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'Authentication required.', 'AUTH_REQUIRED');
  if (user.accountStatus !== 'active') {
    throw new AppError(403, 'Your account is not active.', 'ACCOUNT_INACTIVE');
  }

  req.user = user;
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError(403, 'You do not have permission to do this.', 'FORBIDDEN'));
  }
  next();
};

module.exports = { authenticate, requireRole };
