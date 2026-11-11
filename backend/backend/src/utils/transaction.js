const mongoose = require('mongoose');

/**
 * Runs `fn(session)` inside a MongoDB transaction.
 * If a session is passed in, the caller owns the transaction and we just reuse it,
 * so several service calls can be committed (or rolled back) together.
 */
async function runInTransaction(existingSession, fn) {
  if (existingSession) return fn(existingSession);

  const session = await mongoose.startSession();
  try {
    let result;
    // withTransaction retries automatically on transient errors (e.g. write conflicts)
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { runInTransaction };
