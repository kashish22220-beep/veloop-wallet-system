const AppError = require('../utils/AppError');

// validate(schema, 'body' | 'query') -> replaces req[source] with the parsed (typed, stripped) data
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    return next(new AppError(400, field ? `${field}: ${issue.message}` : issue.message, 'VALIDATION_ERROR'));
  }
  req[source] = result.data;
  next();
};
