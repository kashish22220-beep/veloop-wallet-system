const router = require('express').Router();
const ctrl = require('../controllers/rewardController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { mutationLimiter } = require('../middleware/rateLimiters');
const { referralSchema } = require('../validators/rewardValidators');

router.get('/ad/callback', ctrl.adCallback);
router.use(authenticate);
router.get('/status', ctrl.status);
router.post('/daily', mutationLimiter, ctrl.daily);
router.post('/ad/session', mutationLimiter, ctrl.adSession);
router.post('/bonus', mutationLimiter, ctrl.bonus);
router.post('/referral', mutationLimiter, validate(referralSchema), ctrl.referral);

module.exports = router;
