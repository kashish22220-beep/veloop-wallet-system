const rewardService = require('../services/rewardService');
const asyncHandler = require('../utils/asyncHandler');

exports.status = asyncHandler(async (req, res) => {
  res.json({ success: true, rewards: await rewardService.getStatus(req.user._id) });
});

exports.daily = asyncHandler(async (req, res) => {
  const reward = await rewardService.claimDaily(req.user._id);
  res.status(201).json({ success: true, message: 'Daily reward credited.', reward });
});

exports.adSession = asyncHandler(async (req, res) => {
  const session = await rewardService.startAdSession(req.user._id);
  res.status(201).json({ success: true, session });
});

exports.adCallback = async (req, res) => {
  try {
    const rawQuery = req.originalUrl.split('?')[1] || '';
    const result = await rewardService.handleAdMobCallback(rawQuery, req.query);
    res.status(200).send(result.ignored ? 'ignored' : 'ok');
  } catch (error) {
    console.error('AdMob SSV callback failed:', error.message);
    res.status(error.code === 'INVALID_AD_CALLBACK' ? 403 : 500).send(error.code === 'INVALID_AD_CALLBACK' ? 'bad signature' : 'error');
  }
};

exports.bonus = asyncHandler(async (req, res) => {
  const reward = await rewardService.claimBonus(req.user._id);
  res.status(201).json({ success: true, message: 'Welcome bonus credited.', reward });
});

exports.referral = asyncHandler(async (req, res) => {
  const reward = await rewardService.claimReferral(req.user._id, req.body.referralCode);
  res.status(201).json({ success: true, message: 'Referral reward credited.', reward });
});
