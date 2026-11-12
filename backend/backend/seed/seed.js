/**
 * Seeds DEMO data into YOUR OWN development database.
 *   npm run seed
 * Wipes users, wallets, ledger, withdrawals, payout config and audit logs first.
 * Refuses to run when NODE_ENV=production.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');
const WalletTransaction = require('../src/models/WalletTransaction');
const Withdrawal = require('../src/models/Withdrawal');
const PayoutMethod = require('../src/models/PayoutMethod');
const PayoutOption = require('../src/models/PayoutOption');
const AuditLog = require('../src/models/AuditLog');
const RewardClaim = require('../src/models/RewardClaim');
const AdSession = require('../src/models/AdSession');
const { creditWallet, debitWallet } = require('../src/services/walletService');

const UPI_PATTERN = '^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$';

const METHODS = [
  {
    methodId: 'upi',
    name: 'UPI Transfer',
    subtitle: 'Instant Bank Transfer',
    badge: 'Instant',
    note: 'Processing within 24 hours',
    active: true,
    order: 1,
    requiredFields: [{ key: 'upiId', label: 'UPI ID', type: 'text', pattern: UPI_PATTERN }],
  },
  {
    methodId: 'amazon',
    name: 'Amazon Pay',
    subtitle: 'Gift Card Balance',
    badge: 'Popular',
    note: 'Instant delivery',
    active: true,
    order: 2,
    // TODO: confirm the real gift-card details from the live payout flow
    requiredFields: [{ key: 'email', label: 'Email', type: 'email' }],
  },
  {
    methodId: 'google_play',
    name: 'Google Play',
    subtitle: 'App Store Credit',
    badge: 'Fast',
    note: 'Global redemption',
    active: true,
    order: 3,
    requiredFields: [{ key: 'email', label: 'Email', type: 'email' }],
  },
  {
    methodId: 'paypal',
    name: 'PayPal',
    subtitle: 'Coming Soon',
    badge: null,
    note: 'Currently unavailable in your region',
    active: false,
    unavailableReason: 'Currently unavailable in your region',
    order: 4,
    requiredFields: [],
  },
];

// Live UPI vouchers (payout value in INR -> VEs required)
const UPI_OPTIONS = [
  [10, 2400],
  [25, 5800],
  [50, 10000],
  [100, 19500],
  [150, 28500],
  [300, 52500],
  [500, 80500],
  [1000, 150000],
];

// Verified against the current company payout configuration:
// Amazon: ₹10/2,500, ₹25/5,900, ₹50/10,500, ₹100/19,800, ₹250/47,000 VEs.
// Google Play: ₹10/2,600, ₹25/6,000, ₹50/11,000, ₹100/20,500, ₹150/30,000 VEs.
const GIFT_CARD_OPTIONS = [
  { methodId: 'amazon', payoutValue: 10, requiredAmount: 2500 },
  { methodId: 'amazon', payoutValue: 25, requiredAmount: 5900 },
  { methodId: 'amazon', payoutValue: 50, requiredAmount: 10500 },
  { methodId: 'amazon', payoutValue: 100, requiredAmount: 19800 },
  { methodId: 'amazon', payoutValue: 250, requiredAmount: 47000 },
  { methodId: 'google_play', payoutValue: 10, requiredAmount: 2600 },
  { methodId: 'google_play', payoutValue: 25, requiredAmount: 6000 },
  { methodId: 'google_play', payoutValue: 50, requiredAmount: 11000 },
  { methodId: 'google_play', payoutValue: 100, requiredAmount: 20500 },
  { methodId: 'google_play', payoutValue: 150, requiredAmount: 30000 },
];

async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set.');

  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all(
    [User, Wallet, WalletTransaction, Withdrawal, PayoutMethod, PayoutOption, AuditLog, RewardClaim, AdSession].map((m) => m.deleteMany({}))
  );

  // Payout configuration
  await PayoutMethod.insertMany(METHODS);
  const options = [
    ...UPI_OPTIONS.map(([value, ves], i) => ({
      optionId: `upi_${value}`,
      methodId: 'upi',
      payoutValue: value,
      requiredAmount: ves,
      order: i + 1,
    })),
    ...GIFT_CARD_OPTIONS.map((o, i) => ({
      optionId: `${o.methodId}_${o.payoutValue}`,
      order: i + 1,
      ...o,
    })),
  ];
  await PayoutOption.insertMany(options);

  // Users (clearly marked demo data)
  const [demo, admin] = await User.create([
    {
      name: 'Demo User',
      email: 'demo@veloop.test',
      passwordHash: await bcrypt.hash('Demo@1234', 12),
      isVerified: true,
      isDemo: true,
    },
    {
      name: 'Demo Admin',
      email: 'admin@veloop.test',
      passwordHash: await bcrypt.hash('Admin@1234', 12),
      role: 'admin',
      isVerified: true,
      isDemo: true,
    },
  ]);
  await Wallet.create([{ userId: demo._id }, { userId: admin._id }]);

  // Wallet history built through the real service, so ledger and balances always agree.
  // VEs: 20000 + 4000 + 1000 + 2400 - 2400 = 25000
  const c = (currency, amount, source, description) =>
    creditWallet({ userId: demo._id, currency, amount, source, description, metadata: { demo: true } });

  await c('ves', 20000, 'BONUS', 'Welcome Bonus (demo)');
  await c('ves', 4000, 'AD_REWARD', 'Watch Ad Reward (demo)');
  await c('ves', 1000, 'DAILY_REWARD', 'Daily Reward (demo)');
  await c('ves', 2400, 'REFERRAL', 'Referral Reward (demo)');
  await debitWallet({
    userId: demo._id,
    currency: 'ves',
    amount: 2400,
    source: 'WITHDRAWAL',
    description: 'UPI Withdrawal (demo sample)',
    metadata: { demo: true },
  });
  await c('sves', 5000, 'BONUS', 'Bonus (demo)');
  await c('gems', 100, 'REWARD', 'Reward (demo)');
  await c('tokens', 500, 'GAME_REWARD', 'Game Reward (demo)');
  await c('spins', 3, 'DAILY_REWARD', 'Daily Reward (demo)');

  const w = await Wallet.findOne({ userId: demo._id }).lean();
  console.log('Seed complete.');
  console.log(`  demo user : demo@veloop.test / Demo@1234  (VEs: ${w.ves})`);
  console.log('  admin user: admin@veloop.test / Admin@1234');
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
