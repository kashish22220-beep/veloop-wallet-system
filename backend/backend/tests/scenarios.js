/**
 * Automated scenario tests for the VELoop wallet backend.
 *
 * 1. Start the server:   npm run dev      (in one terminal)
 * 2. Seed once:          npm run seed
 * 3. Run the tests:      node tests/scenarios.js   (in another terminal)
 *
 * Needs Node 18+ (built-in fetch). Each run registers fresh test users, so balances start at 0.
 * Optional: API_URL=http://localhost:5000 node tests/scenarios.js
 */
const { randomUUID } = require('crypto');

const BASE = process.env.API_URL || 'http://localhost:5000';
const ADMIN = { email: 'admin@veloop.test', password: 'Admin@1234' };
const GOOD_DETAILS = { upiId: 'tester@upi' };

let passed = 0;
let failed = 0;

function check(name, condition, info = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${info ? `-> ${info}` : ''}`);
  }
}

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

const short = (r) => `status ${r.status}, message "${r.data && r.data.message}"`;

async function registerUser(label) {
  const email = `test_${label}_${Date.now()}_${Math.floor(Math.random() * 1000)}@veloop.test`;
  const r = await api('POST', '/api/auth/register', {
    body: { name: `Test ${label}`, email, password: 'Test@12345' },
  });
  if (r.status !== 201) throw new Error(`Could not register test user: ${short(r)}`);
  return { token: r.data.token, id: r.data.user.id, email };
}

const adminCredit = (admin, userId, amount, currency = 'ves') =>
  api('POST', '/api/wallet/credit', {
    token: admin,
    body: { userId, currency, amount, description: 'Test credit', idempotencyKey: randomUUID() },
  });

const adminDebit = (admin, userId, amount, currency = 'ves') =>
  api('POST', '/api/wallet/debit', {
    token: admin,
    body: { userId, currency, amount, description: 'Test debit', idempotencyKey: randomUUID() },
  });

const withdraw = (token, optionId, { key = randomUUID(), method = 'upi', details = GOOD_DETAILS, extra = {} } = {}) =>
  api('POST', '/api/withdrawals', {
    token,
    headers: { 'Idempotency-Key': key },
    body: { method, optionId, payoutDetails: details, ...extra },
  });

const adminStatus = (admin, withdrawalId, body) =>
  api('POST', `/api/admin/withdrawals/${withdrawalId}/status`, { token: admin, body });

async function balance(token, currency = 'ves') {
  const r = await api('GET', '/api/wallet', { token });
  return r.data.wallet[currency];
}

async function allTransactions(token) {
  const rows = [];
  for (let page = 1; page < 20; page += 1) {
    const r = await api('GET', `/api/wallet/transactions?page=${page}&limit=100`, { token });
    rows.push(...r.data.transactions);
    if (page >= r.data.totalPages) break;
  }
  return rows;
}

// Current balance must equal credits - debits from the ledger (all test users start at 0)
async function ledgerMatches(token) {
  const txs = await allTransactions(token);
  const sum = txs
    .filter((t) => t.currency === 'ves')
    .reduce((acc, t) => acc + (t.type === 'CREDIT' ? t.amount : -t.amount), 0);
  const bal = await balance(token);
  return { ok: sum === bal, sum, bal };
}

async function main() {
  console.log(`\nVELoop wallet scenario tests against ${BASE}\n`);

  const health = await api('GET', '/health');
  if (health.status !== 200) {
    console.log('Server is not reachable. Start it with: npm run dev');
    process.exit(1);
  }

  const adminLogin = await api('POST', '/api/auth/login', { body: ADMIN });
  if (adminLogin.status !== 200) {
    console.log('Admin login failed. Did you run: npm run seed ?', short(adminLogin));
    process.exit(1);
  }
  const admin = adminLogin.data.token;

  /* ---------------------------------------------------------------- */
  console.log('Authentication');
  const noToken = await api('GET', '/api/wallet');
  check('Wallet without token is rejected (401)', noToken.status === 401, short(noToken));
  const badToken = await api('GET', '/api/wallet', { token: 'not.a.real.token' });
  check('Wallet with fake token is rejected (401)', badToken.status === 401, short(badToken));

  /* ---------------------------------------------------------------- */
  console.log('\nTest 1 - Normal credit (1000 + 500 = 1500)');
  const u1 = await registerUser('credit');
  await adminCredit(admin, u1.id, 1000);
  await adminCredit(admin, u1.id, 500);
  check('Balance is 1500', (await balance(u1.token)) === 1500);
  const t1 = (await allTransactions(u1.token)).reverse(); // oldest first
  check('Two ledger entries exist', t1.length === 2, `found ${t1.length}`);
  check(
    'Ledger balanceBefore/After chain is correct',
    t1[0].balanceBefore === 0 && t1[0].balanceAfter === 1000 && t1[1].balanceBefore === 1000 && t1[1].balanceAfter === 1500
  );

  /* ---------------------------------------------------------------- */
  console.log('\nTest 2 - Normal debit (1500 - 1000 = 500)');
  const d = await adminDebit(admin, u1.id, 1000);
  check('Debit accepted', d.status === 201, short(d));
  check('Balance is 500', (await balance(u1.token)) === 500);

  /* ---------------------------------------------------------------- */
  console.log('\nTest 3 - Insufficient balance');
  const d3 = await adminDebit(admin, u1.id, 1000);
  check('Debit of 1000 with 500 is rejected', d3.status === 400 && d3.data.message === 'Insufficient VEs balance.', short(d3));
  const w3 = await withdraw(u1.token, 'upi_10');
  check('Withdrawal needing 2,400 VEs with 500 is rejected', w3.status === 400 && w3.data.message === 'Insufficient VEs balance.', short(w3));
  check('Balance unchanged (500)', (await balance(u1.token)) === 500);

  /* ---------------------------------------------------------------- */
  console.log('\nTest 4 - Double-click withdrawal (same Idempotency-Key, sent at the same time)');
  const u2 = await registerUser('double');
  await adminCredit(admin, u2.id, 30000);
  const sameKey = randomUUID();
  const dbl = await Promise.all([withdraw(u2.token, 'upi_10', { key: sameKey }), withdraw(u2.token, 'upi_10', { key: sameKey })]);
  const dblStatuses = dbl.map((r) => r.status).sort();
  check('Exactly one 201 and one 409', dblStatuses[0] === 201 && dblStatuses[1] === 409, `got ${dblStatuses}`);
  check('Balance reduced only once (30000 - 2400 = 27600)', (await balance(u2.token)) === 27600);
  const u2list = await api('GET', '/api/withdrawals', { token: u2.token });
  check('Only one withdrawal stored', u2list.data.total === 1, `found ${u2list.data.total}`);
  const u2WithdrawalId = (dbl.find((r) => r.status === 201) || {}).data?.withdrawal?.withdrawalId;

  /* ---------------------------------------------------------------- */
  console.log('\nTest 5 - Concurrent withdrawals (balance 10,000, two requests of 10,000)');
  const u3 = await registerUser('concurrent');
  await adminCredit(admin, u3.id, 10000);
  const conc = await Promise.all([withdraw(u3.token, 'upi_50'), withdraw(u3.token, 'upi_50')]);
  const concStatuses = conc.map((r) => r.status).sort();
  check('Exactly one succeeds, the other is rejected', concStatuses[0] === 201 && concStatuses[1] === 400, `got ${concStatuses}`);
  check('Balance is 0 (never negative)', (await balance(u3.token)) === 0);

  /* ---------------------------------------------------------------- */
  console.log('\nTest 6 - Invalid payout option / inactive method');
  const u4 = await registerUser('invalid');
  await adminCredit(admin, u4.id, 5000);
  const fake = await withdraw(u4.token, 'upi_9999');
  check('Fake option id is rejected', fake.status === 400 && fake.data.message === 'Selected payout option is unavailable.', short(fake));
  const paypal = await withdraw(u4.token, 'paypal_10', { method: 'paypal', details: {} });
  check('Inactive method (PayPal) is rejected', paypal.status === 400 && paypal.data.message === 'This payout method is currently unavailable.', short(paypal));
  const paypalOptions = await api('GET', '/api/payout/options/paypal', { token: u4.token });
  check('PayPal options endpoint says unavailable', paypalOptions.status === 400, short(paypalOptions));
  const badUpi = await withdraw(u4.token, 'upi_10', { details: { upiId: 'not-a-upi-id' } });
  check('Invalid UPI ID is rejected', badUpi.status === 400, short(badUpi));
  check('Balance unchanged (5000)', (await balance(u4.token)) === 5000);

  /* ---------------------------------------------------------------- */
  console.log("\nTest 7 - One user trying to reach another user's data");
  const sneaky = await api('GET', `/api/wallet?userId=${u2.id}`, { token: u1.token });
  check("?userId=<someone else> is ignored; user sees their own wallet (500, not 27600)", sneaky.data.wallet.ves === 500, `saw ${sneaky.data.wallet.ves}`);
  if (u2WithdrawalId) {
    const other = await api('GET', `/api/withdrawals/${u2WithdrawalId}`, { token: u1.token });
    check("Another user's withdrawal returns 404", other.status === 404, short(other));
    const otherCancel = await api('POST', `/api/withdrawals/${u2WithdrawalId}/cancel`, { token: u1.token });
    check("Cannot cancel another user's withdrawal (404)", otherCancel.status === 404, short(otherCancel));
  }
  const userCredit = await api('POST', '/api/wallet/credit', {
    token: u1.token,
    body: { userId: u1.id, currency: 'ves', amount: 99999, description: 'give myself money', idempotencyKey: randomUUID() },
  });
  check('Normal user cannot call /api/wallet/credit (403)', userCredit.status === 403, short(userCredit));
  const userAdmin = await api('GET', '/api/admin/withdrawals', { token: u1.token });
  check('Normal user cannot open admin withdrawals (403)', userAdmin.status === 403, short(userAdmin));

  /* ---------------------------------------------------------------- */
  console.log('\nTest 8 - Rejected withdrawal gives the VEs back');
  const u5 = await registerUser('reject');
  await adminCredit(admin, u5.id, 20000);
  const w8 = await withdraw(u5.token, 'upi_100');
  check('Withdrawal of Rs 100 created as PENDING', w8.status === 201 && w8.data.withdrawal.status === 'PENDING', short(w8));
  check('19,500 VEs deducted (20000 -> 500)', (await balance(u5.token)) === 500);
  const id8 = w8.data.withdrawal.withdrawalId;

  const noReason = await adminStatus(admin, id8, { status: 'REJECTED' });
  check('Reject without a reason is refused (400)', noReason.status === 400, short(noReason));
  const rej = await adminStatus(admin, id8, { status: 'REJECTED', rejectionReason: 'UPI ID could not be verified' });
  check('Admin can reject', rej.status === 200 && rej.data.withdrawal.status === 'REJECTED', short(rej));
  check('VEs refunded (back to 20000)', (await balance(u5.token)) === 20000);
  const rejAgain = await adminStatus(admin, id8, { status: 'REJECTED', rejectionReason: 'second try' });
  check('Rejecting twice is refused (409)', rejAgain.status === 409, short(rejAgain));
  check('No double refund (still 20000)', (await balance(u5.token)) === 20000);
  const txs8 = await allTransactions(u5.token);
  check('Ledger has a WITHDRAWAL and a WITHDRAWAL_REFUND entry',
    txs8.some((t) => t.source === 'WITHDRAWAL') && txs8.some((t) => t.source === 'WITHDRAWAL_REFUND'));

  console.log('\nTest 8b - Approve flow and user cancel');
  const w8b = await withdraw(u5.token, 'upi_10');
  const id8b = w8b.data.withdrawal.withdrawalId;
  const skip = await adminStatus(admin, id8b, { status: 'APPROVED' });
  check('Cannot jump PENDING -> APPROVED (409)', skip.status === 409, short(skip));
  const proc = await adminStatus(admin, id8b, { status: 'PROCESSING' });
  check('PENDING -> PROCESSING', proc.status === 200 && proc.data.withdrawal.status === 'PROCESSING', short(proc));
  const appr = await adminStatus(admin, id8b, { status: 'APPROVED' });
  check('PROCESSING -> APPROVED', appr.status === 200 && appr.data.withdrawal.status === 'APPROVED', short(appr));
  check('Approved keeps the deduction (20000 - 2400 = 17600)', (await balance(u5.token)) === 17600);
  const w8c = await withdraw(u5.token, 'upi_10');
  const cancel = await api('POST', `/api/withdrawals/${w8c.data.withdrawal.withdrawalId}/cancel`, { token: u5.token });
  check('User can cancel own PENDING withdrawal', cancel.status === 200 && cancel.data.withdrawal.status === 'CANCELLED', short(cancel));
  check('Cancel refunded the VEs (17600)', (await balance(u5.token)) === 17600);

  /* ---------------------------------------------------------------- */
  console.log('\nTest 9 - API manipulation');
  const u6 = await registerUser('manip');
  await adminCredit(admin, u6.id, 20000);
  const withAmount = await withdraw(u6.token, 'upi_100', { extra: { amount: 1 } });
  check('Request with an "amount" field is rejected (400)', withAmount.status === 400, short(withAmount));
  check('Balance untouched after tampered request (20000)', (await balance(u6.token)) === 20000);
  const withValue = await withdraw(u6.token, 'upi_100', { extra: { requiredAmount: 1, payoutValue: 100000 } });
  check('Request with requiredAmount/payoutValue is rejected (400)', withValue.status === 400, short(withValue));
  const noKey = await api('POST', '/api/withdrawals', {
    token: u6.token,
    body: { method: 'upi', optionId: 'upi_100', payoutDetails: GOOD_DETAILS },
  });
  check('Missing Idempotency-Key is rejected (400)', noKey.status === 400, short(noKey));
  const real = await withdraw(u6.token, 'upi_100');
  check('Honest request deducts exactly the server amount (19,500)', real.status === 201 && (await balance(u6.token)) === 500);
  check('Stored payout is Rs 100 (from the database)', real.data.withdrawal.payoutAmount === 100 && real.data.withdrawal.currencyAmount === 19500);

  /* ---------------------------------------------------------------- */
  console.log('\nLedger consistency (balance = credits - debits)');
  for (const [label, u] of [['credit user', u1], ['double-click user', u2], ['concurrent user', u3], ['reject user', u5], ['manipulation user', u6]]) {
    const m = await ledgerMatches(u.token);
    check(`${label}: ledger total ${m.sum} equals balance ${m.bal}`, m.ok);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nTest run crashed:', err.message);
  process.exit(1);
});
