// Wallet currencies. The key is also the field name on the Wallet document.
const CURRENCY_LIST = ['ves', 'sves', 'gems', 'tokens', 'spins'];
const CURRENCY_LABEL = {
  ves: 'VEs',
  sves: 'SVEs',
  gems: 'Gems',
  tokens: 'Tokens',
  spins: 'Spins',
};

// Ledger direction is `type`; the reason is `source`.
const CREDIT_SOURCES = [
  'REWARD',
  'BONUS',
  'REFERRAL',
  'DAILY_REWARD',
  'AD_REWARD',
  'GAME_REWARD',
  'ADMIN_CREDIT',
  'EXCHANGE_CREDIT',
  'WITHDRAWAL_REFUND', // release of a rejected/cancelled withdrawal
];
const DEBIT_SOURCES = ['WITHDRAWAL', 'EXCHANGE_DEBIT', 'ADMIN_DEBIT', 'CORRECTION'];

// Sources the protected admin APIs are allowed to use
const ADMIN_CREDIT_SOURCES = ['ADMIN_CREDIT'];
const ADMIN_DEBIT_SOURCES = ['ADMIN_DEBIT', 'CORRECTION'];

const MAX_AMOUNT = 100000000; // sanity cap per single operation

// PLACEHOLDER for the "Current VEs Value" shown on the Wallet page.
// Replace with the real conversion used by VELoop.
const ESTIMATE_VES_PER_INR = 150;

// Simple fraud guard: max withdrawals that can be waiting for review at once
const MAX_PENDING_WITHDRAWALS = 3;

// Allowed withdrawal status changes
const WITHDRAWAL_TRANSITIONS = {
  PENDING: ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PROCESSING: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

module.exports = {
  CURRENCY_LIST,
  CURRENCY_LABEL,
  CREDIT_SOURCES,
  DEBIT_SOURCES,
  ADMIN_CREDIT_SOURCES,
  ADMIN_DEBIT_SOURCES,
  MAX_AMOUNT,
  ESTIMATE_VES_PER_INR,
  MAX_PENDING_WITHDRAWALS,
  WITHDRAWAL_TRANSITIONS,
};
