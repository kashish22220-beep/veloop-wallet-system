const router = require('express').Router();
const ctrl = require('../controllers/withdrawalController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { withdrawalLimiter } = require('../middleware/rateLimiters');
const {
  createWithdrawalSchema,
  listQuerySchema,
  withdrawalIdParam,
} = require('../validators/withdrawalValidators');

router.use(authenticate);

router.post('/', withdrawalLimiter, validate(createWithdrawalSchema), ctrl.create);
router.get('/', validate(listQuerySchema, 'query'), ctrl.list);
router.get('/:withdrawalId', validate(withdrawalIdParam, 'params'), ctrl.get);
router.post('/:withdrawalId/cancel', withdrawalLimiter, validate(withdrawalIdParam, 'params'), ctrl.cancel);

module.exports = router;
