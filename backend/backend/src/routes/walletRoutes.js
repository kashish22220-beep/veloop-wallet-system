const router = require('express').Router();
const ctrl = require('../controllers/walletController');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { mutationLimiter } = require('../middleware/rateLimiters');
const {
  transactionsQuerySchema,
  adminCreditSchema,
  adminDebitSchema,
} = require('../validators/walletValidators');

// Every wallet route needs a valid JWT
router.use(authenticate);

router.get('/', ctrl.getWallet);
router.get('/summary', ctrl.getSummary);
router.get('/transactions', validate(transactionsQuerySchema, 'query'), ctrl.getTransactions);

// Internal / admin only. Normal users get 403.
router.post('/credit', requireRole('admin'), mutationLimiter, validate(adminCreditSchema), ctrl.adminCredit);
router.post('/debit', requireRole('admin'), mutationLimiter, validate(adminDebitSchema), ctrl.adminDebit);

module.exports = router;
