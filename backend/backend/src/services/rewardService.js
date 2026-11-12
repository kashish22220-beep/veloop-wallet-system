const RewardClaim = require('../models/RewardClaim');
const AdSession = require('../models/AdSession');
const User = require('../models/User');
const { randomBytes, createVerify } = require('crypto');
const walletService = require('./walletService');
const { runInTransaction } = require('../utils/transaction');
const AppError = require('../utils/AppError');

const DAILY_AMOUNT = 500;
const AD_AMOUNT = 100;
const AD_LIMIT = 10;
const BONUS_AMOUNT = 1000;
const REFERRER_AMOUNT = 1000;
const REFEREE_AMOUNT = 500;
const STREAK_REWARDS = [500, 650, 800, 1000, 1250, 1600, 2500];
const AD_SESSION_TTL_MINUTES = 10;
const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
let adMobKeyCache = { at: 0, keys: {} };

const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
const previousDateKey = () => dateKey(new Date(Date.now() + 5.5 * 3600000 - 86400000));
const adKey = (day) => new RegExp(`^${day}:`);
const istDateKey = () => dateKey(new Date(Date.now() + 5.5 * 3600000));

function publicStatus(user, daily, adCount, bonusClaimed) {
  return {
    balance: user.ves,
    daily: {
      claimed: !!daily,
      amount: DAILY_AMOUNT,
      streakDay: daily?.streakDay || 0,
      nextReward: STREAK_REWARDS[(daily?.streakDay || 0) % STREAK_REWARDS.length],
    },
    ads: { amount: AD_AMOUNT, claimedToday: adCount, remaining: Math.max(0, AD_LIMIT - adCount) },
    bonus: { amount: BONUS_AMOUNT, claimed: bonusClaimed },
    referral: { code: user.referralCode, refereeAmount: REFEREE_AMOUNT, referrerAmount: REFERRER_AMOUNT },
  };
}

async function getStatus(userId) {
  const day = istDateKey();
  const [user, daily, adCount, bonus] = await Promise.all([
    User.findById(userId).lean(),
    RewardClaim.findOne({ userId, type: 'DAILY_REWARD', claimKey: day }).lean(),
    RewardClaim.countDocuments({ userId, type: 'AD_REWARD', claimKey: adKey(day) }),
    RewardClaim.exists({ userId, type: 'BONUS', claimKey: 'welcome' }),
  ]);
  if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  if (!user.referralCode) {
    user.referralCode = randomBytes(5).toString('hex').toUpperCase();
    await User.findByIdAndUpdate(userId, { $set: { referralCode: user.referralCode } });
  }
  return publicStatus(user, daily, adCount, !!bonus);
}

async function claimDaily(userId) {
  const day = istDateKey();
  return runInTransaction(null, async (session) => {
    const existing = await RewardClaim.findOne({ userId, type: 'DAILY_REWARD', claimKey: day }).session(session);
    if (existing) throw new AppError(409, 'Your daily reward is already claimed.', 'REWARD_ALREADY_CLAIMED');

    const last = await RewardClaim.findOne({ userId, type: 'DAILY_REWARD' }).sort({ createdAt: -1 }).session(session);
    const streakDay = last?.claimKey === previousDateKey()
      ? (last.streakDay % STREAK_REWARDS.length) + 1
      : 1;
    const amount = STREAK_REWARDS[streakDay - 1] || DAILY_AMOUNT;
    const credit = await walletService.creditWallet({
      userId,
      currency: 'ves',
      amount,
      source: 'DAILY_REWARD',
      idempotencyKey: `daily:${userId}:${day}`,
      description: `Daily check-in reward (day ${streakDay})`,
      metadata: { streakDay },
    }, session);
    await RewardClaim.create([{ userId, type: 'DAILY_REWARD', claimKey: day, amount, streakDay }], { session });
    return { amount, streakDay, transaction: credit.transaction };
  });
}

async function startAdSession(userId) {
  const day = istDateKey();
  const count = await RewardClaim.countDocuments({ userId, type: 'AD_REWARD', claimKey: adKey(day) });
  if (count >= AD_LIMIT) throw new AppError(429, 'Your daily ad reward limit is reached.', 'AD_LIMIT_REACHED');
  const session = await AdSession.create({
    userId,
    expiresAt: new Date(Date.now() + AD_SESSION_TTL_MINUTES * 60000),
  });
  return { sessionId: session.sessionId, expiresAt: session.expiresAt, amount: AD_AMOUNT };
}

async function getAdMobKey(keyId) {
  if (!adMobKeyCache.keys[String(keyId)] || Date.now() - adMobKeyCache.at > 86400000) {
    const response = await fetch(ADMOB_KEYS_URL);
    if (!response.ok) throw new Error(`AdMob key service returned ${response.status}`);
    const payload = await response.json();
    adMobKeyCache = {
      at: Date.now(),
      keys: Object.fromEntries(payload.keys.map((key) => [String(key.keyId), key.pem])),
    };
  }
  return adMobKeyCache.keys[String(keyId)];
}

async function verifyAdMobSignature(rawQuery, query) {
  const signatureMarker = '&signature=';
  const signatureIndex = rawQuery.indexOf(signatureMarker);
  if (signatureIndex < 0 || !query.signature || !query.key_id) return false;
  const pem = await getAdMobKey(query.key_id);
  if (!pem) return false;
  return createVerify('SHA256')
    .update(rawQuery.substring(0, signatureIndex))
    .verify(pem, Buffer.from(query.signature, 'base64url'));
}

async function handleAdMobCallback(rawQuery, query) {
  if (!(await verifyAdMobSignature(rawQuery, query))) {
    throw new AppError(403, 'Invalid AdMob callback signature.', 'INVALID_AD_CALLBACK');
  }
  const { transaction_id: transactionId, custom_data: sessionId } = query;
  if (!transactionId || !sessionId) return { ignored: true };

  return runInTransaction(null, async (session) => {
    const adSession = await AdSession.findOneAndUpdate(
      { sessionId, status: 'pending', expiresAt: { $gt: new Date() } },
      { $set: { status: 'completed', transactionId } },
      { new: true, session }
    );
    if (!adSession) return { ignored: true };

    const day = istDateKey();
    const count = await RewardClaim.countDocuments({ userId: adSession.userId, type: 'AD_REWARD', claimKey: adKey(day) }).session(session);
    if (count >= AD_LIMIT) return { ignored: true };
    const credit = await walletService.creditWallet({
      userId: adSession.userId,
      currency: 'ves',
      amount: AD_AMOUNT,
      source: 'AD_REWARD',
      idempotencyKey: `admob:${transactionId}`,
      description: 'Verified AdMob reward',
      metadata: { transactionId, adSessionId: sessionId },
    }, session);
    if (!credit.duplicate) {
      await RewardClaim.create([{
        userId: adSession.userId,
        type: 'AD_REWARD',
        claimKey: `${day}:${transactionId}`,
        amount: AD_AMOUNT,
      }], { session });
    }
    return { credited: !credit.duplicate };
  });
}

async function claimBonus(userId) {
  return runInTransaction(null, async (session) => {
    const existing = await RewardClaim.findOne({ userId, type: 'BONUS', claimKey: 'welcome' }).session(session);
    if (existing) throw new AppError(409, 'Your welcome bonus is already claimed.', 'REWARD_ALREADY_CLAIMED');
    const credit = await walletService.creditWallet({
      userId, currency: 'ves', amount: BONUS_AMOUNT, source: 'BONUS',
      idempotencyKey: `bonus:${userId}:welcome`, description: 'Welcome bonus',
    }, session);
    await RewardClaim.create([{ userId, type: 'BONUS', claimKey: 'welcome', amount: BONUS_AMOUNT }], { session });
    return { amount: BONUS_AMOUNT, transaction: credit.transaction };
  });
}

async function claimReferral(userId, referralCode) {
  const code = String(referralCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(code)) throw new AppError(400, 'Enter a valid referral code.', 'INVALID_REFERRAL_CODE');
  return runInTransaction(null, async (session) => {
    const referrer = await User.findOne({ referralCode: code }).session(session);
    if (!referrer) throw new AppError(404, 'Referral code not found.', 'REFERRAL_NOT_FOUND');
    if (referrer._id.toString() === userId.toString()) throw new AppError(400, 'You cannot use your own referral code.', 'SELF_REFERRAL');
    const existing = await RewardClaim.findOne({ userId, type: 'REFERRAL_SENT', claimKey: code }).session(session);
    if (existing) throw new AppError(409, 'This referral has already been claimed.', 'REWARD_ALREADY_CLAIMED');

    await walletService.creditWallet({
      userId, currency: 'ves', amount: REFEREE_AMOUNT, source: 'REFERRAL',
      idempotencyKey: `referral:${userId}:${code}`, description: 'Referral reward',
      metadata: { referrerId: referrer._id.toString() },
    }, session);
    await walletService.creditWallet({
      userId: referrer._id, currency: 'ves', amount: REFERRER_AMOUNT, source: 'REFERRAL',
      idempotencyKey: `referral:${referrer._id}:${userId}`, description: 'Friend referral bonus',
      metadata: { referredUserId: userId.toString() },
    }, session);
    await RewardClaim.create([
      { userId, type: 'REFERRAL_SENT', claimKey: code, amount: REFEREE_AMOUNT, referredUserId: referrer._id },
      { userId: referrer._id, type: 'REFERRAL_RECEIVED', claimKey: userId.toString(), amount: REFERRER_AMOUNT, referredUserId: userId },
    ], { session });
    return { amount: REFEREE_AMOUNT };
  });
}

module.exports = {
  getStatus,
  claimDaily,
  startAdSession,
  handleAdMobCallback,
  claimBonus,
  claimReferral,
};
