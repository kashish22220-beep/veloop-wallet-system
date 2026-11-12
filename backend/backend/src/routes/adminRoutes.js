const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { mutationLimiter } = require('../middleware/rateLimiters');
const {
  listQuerySchema,
  withdrawalIdParam,
  adminStatusSchema,
  optionIdParam,
  updateOptionSchema,
} = require('../validators/withdrawalValidators');
const {
  adminListQuerySchema,
  adminTransactionQuerySchema,
  userIdParam,
  userStatusSchema,
} = require('../validators/adminValidators');

// Everything here is admin-only
router.use(authenticate, requireRole('admin'));

router.get('/overview', ctrl.overview);
router.get('/users', validate(adminListQuerySchema, 'query'), ctrl.listUsers);
router.patch(
  '/users/:userId/status',
  mutationLimiter,
  validate(userIdParam, 'params'),
  validate(userStatusSchema),
  ctrl.updateUserStatus
);
router.get('/transactions', validate(adminTransactionQuerySchema, 'query'), ctrl.listTransactions);
router.get('/payouts', ctrl.listPayouts);
router.get('/withdrawals', validate(listQuerySchema, 'query'), ctrl.listWithdrawals);
router.post(
  '/withdrawals/:withdrawalId/status',
  mutationLimiter,
  validate(withdrawalIdParam, 'params'),
  validate(adminStatusSchema),
  ctrl.updateWithdrawalStatus
);
router.patch(
  '/payout/options/:optionId',
  mutationLimiter,
  validate(optionIdParam, 'params'),
  validate(updateOptionSchema),
  ctrl.updatePayoutOption
);

module.exports = router;
