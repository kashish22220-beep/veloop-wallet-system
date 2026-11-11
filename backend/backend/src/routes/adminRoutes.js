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

// Everything here is admin-only
router.use(authenticate, requireRole('admin'));

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
