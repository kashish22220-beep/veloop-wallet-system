const router = require('express').Router();
const ctrl = require('../controllers/payoutController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { methodParam } = require('../validators/withdrawalValidators');

router.use(authenticate);

router.get('/methods', ctrl.getMethods);
router.get('/options', ctrl.getAllOptions);
router.get('/options/:method', validate(methodParam, 'params'), ctrl.getMethodOptions);

module.exports = router;
