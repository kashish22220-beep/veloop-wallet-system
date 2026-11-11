const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, 'Route not found.', 'NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
  }
  if (err.code === 11000) {
    return res
      .status(409)
      .json({ success: false, message: 'This request has already been submitted.', code: 'DUPLICATE' });
  }
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid request.', code: 'INVALID_REQUEST' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body.', code: 'INVALID_JSON' });
  }

  // Never leak internal / database errors to the client
  console.error(err);
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' });
}

module.exports = { notFound, errorHandler };
