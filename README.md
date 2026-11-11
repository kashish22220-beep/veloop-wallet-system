# VELoop Rewards - Wallet & Payout System

A backend-driven wallet, ledger and withdrawal system for VELoop Rewards. The backend owns all money logic. The React frontend is only a thin demo interface.

- **Frontend (live):** https://veloop-wallet-system-livid.vercel.app
- **Backend API (live):** https://veloop-wallet-syatem.onrender.com/api
- **API docs:** [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Postman collection:** [postman/VELoop_Wallet.postman_collection.json](./postman/VELoop_Wallet.postman_collection.json)
- **Test results:** see `TEST_RESULTS` in the backend folder

> The backend is on Render's free plan. The first request after inactivity can take 30-50 seconds.

## Technologies

Node.js, Express.js, MongoDB (Atlas), Mongoose, JWT, Passport (Google OAuth), React (Vite), Axios, CSS.

## Repository structure

```
backend/backend/
  src/
    config/        constants (currencies, sources, transitions), passport
    controllers/   thin request handlers
    middleware/    auth (authenticate, requireRole), validate, rateLimiters
    models/        User, Wallet, WalletTransaction, Withdrawal,
                   PayoutMethod, PayoutOption, AuditLog
    routes/        auth, wallet, payout, withdrawals, admin
    services/      walletService, withdrawalService, auditService
    utils/         AppError, transaction helper
    validators/    request schemas
  seed/            demo user, wallet, ledger and payout options
  tests/           scenario tests
veloop-frontend/frontend/
  src/pages/       Login, Signup, Wallet, Payout
  src/api.js       axios client (JWT in Authorization header)
```

## Setup

```bash
git clone https://github.com/kashish22220-beep/veloop-wallet-system.git
cd veloop-wallet-system/backend/backend
npm install
cp .env.example .env        # then fill in the values
npm run seed                # creates demo user, wallet, ledger, payout options
npm run dev                 # http://localhost:5000
```

Frontend:

```bash
cd veloop-frontend/frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:5000/api
npm run dev                 # http://localhost:5173
```

### Environment variables (backend)

| Name | Purpose |
|---|---|
| `PORT` | Server port (Render sets this itself) |
| `NODE_ENV` | `development` / `production` |
| `MONGO_URI` | MongoDB connection string. **Must be a replica set** (Atlas is), because transactions are used |
| `JWT_SECRET` | Secret used to sign tokens |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `CLIENT_ORIGIN` | Frontend URL (CORS and Google redirect) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google login |

`.env` is never committed. Only `.env.example` is.

### Demo data (seed)

Demo user `demo@veloop.test` with VEs 25,000, SVEs 5,000, Gems 100, Tokens 500, Spins 3, plus sample ledger entries (ad reward, daily reward, referral, bonus, withdrawal). The seed also creates the payout methods and the 8 UPI options. This is clearly marked demo data.

## Database architecture

| Collection | Purpose |
|---|---|
| `User` | Identity, role (`user` / `admin`), level, verified flag |
| `Wallet` | One document per user: `ves`, `sves`, `gems`, `tokens`, `spins`, `lifetimeVesEarned` |
| `WalletTransaction` | The **ledger**. Every balance change has one row |
| `Withdrawal` | Withdrawal requests with status and `statusHistory` |
| `PayoutMethod` | Method config (UPI, Amazon, Google Play), required detail fields, active flag |
| `PayoutOption` | Voucher/denomination: `payoutValue`, `requiredAmount`, `requiredCurrency`, `eligibility`, `active` |
| `AuditLog` | Who did what, to whom, when, from which IP |

### Ledger

Each `WalletTransaction` stores `transactionId`, `userId`, `currency`, `type` (CREDIT/DEBIT), `amount`, `balanceBefore`, `balanceAfter`, `source`, `referenceId`, `idempotencyKey`, `status`, `description`, `metadata` and timestamps.

Consistency rule: `current balance = initial balance + sum(credits) - sum(debits)`. Any difference can be investigated by walking the ledger for that user and currency.

### Indexes

`userId`, `transactionId`, `withdrawalId`, `referenceId`, `createdAt`, `status`, and **unique** indexes on `(userId, idempotencyKey)` for both ledger and withdrawals (the final duplicate guard).

## Money flow (Option A: deduct immediately)

On a withdrawal request the VEs are **deducted immediately**. If the request is rejected or cancelled, the VEs are **refunded** with a `WITHDRAWAL_REFUND` ledger credit.

`createWithdrawal` runs in one MongoDB transaction:

1. Same `Idempotency-Key` already used? Return the original withdrawal. No second deduction.
2. Load the payout method and option **from the database** (must exist and be active).
3. Check eligibility (level, verified flag).
4. Validate payout details against the fields the method requires. Unexpected fields are rejected.
5. Limit of open (PENDING/PROCESSING) withdrawals per user.
6. Debit the wallet. The balance check is **inside the update filter** (`{ userId, ves: { $gte: amount } }` with `$inc`), so check + deduct is a single atomic operation.
7. Write the ledger row.
8. Create the `Withdrawal` (status `PENDING`).
9. Write the audit log.

If any step fails, the whole transaction rolls back. The wallet is never partially modified.

### Status flow

`PENDING` -> `PROCESSING` -> `APPROVED`, or `REJECTED` / `CANCELLED`. Allowed moves are defined in `WITHDRAWAL_TRANSITIONS`. The final update is conditional on the old status (`findOneAndUpdate({ _id, status: old })`), so a refund can never run twice, even with two admins clicking at the same time. The refund also has its own idempotency key (`wd-refund:<withdrawalId>`).

## Security

- **Authentication:** JWT on all wallet, payout, withdrawal and admin routes. The user always comes from the token. No `userId` is accepted from the client.
- **Authorization:** `requireRole('admin')` on `POST /wallet/credit`, `POST /wallet/debit` and every `/admin` route. A user can only read or cancel their own withdrawals; another user's ID looks like "not found".
- **Validation:** schemas on every body/query/param. Currency, amount (positive safe integer, max limit), source and payout details are re-checked inside the service.
- **Server-authoritative amounts:** the frontend sends only `method`, `optionId` and `details`. The required VEs and payout value come from the database. An extra `amount` field is ignored.
- **Atomic operations / transactions:** see "Money flow".
- **Idempotency:** `Idempotency-Key` header on `POST /withdrawals`, stored with a unique index. Double-clicks and retries return the first result.
- **Rate limiting:** `authLimiter` (login/register), `withdrawalLimiter`, `mutationLimiter`.
- **Audit logs:** withdrawal created/processing/approved/rejected/cancelled, admin credit/debit, payout config changes.
- **Errors:** controlled `AppError` messages; internal database errors are never returned.
- **Secrets:** `.env` is git-ignored. Only the JWT is stored in browser `localStorage`. Balances are never stored in the browser.

## How an evaluator can test

Use the Postman collection (set `baseUrl`, log in as `demo@veloop.test`) or the live site.

| # | Test | How | Expected |
|---|---|---|---|
| 1 | Credit | Admin `POST /wallet/credit` +500 VEs | Balance +500, CREDIT ledger row |
| 2 | Withdrawal | Redeem Rs10 UPI | VEs -2,400, DEBIT row, status PENDING |
| 3 | Insufficient balance | Redeem a voucher that costs more than the balance | 400 "Insufficient VEs balance." |
| 4 | Double click | Send `POST /withdrawals` twice with the same `Idempotency-Key` | One withdrawal, one deduction |
| 5 | Concurrent | Two requests with different keys at the same time, balance enough for only one | Only one succeeds |
| 6 | Fake option | `optionId: "upi_999999"` | 400 "Selected payout option is unavailable." |
| 7 | Other user's wallet | Call `/wallet?userId=<other>` or another user's withdrawal id | Own wallet returned / 404 |
| 8 | Rejected withdrawal | Admin `POST /admin/withdrawals/:id/status` with `REJECTED` | VEs refunded, `WITHDRAWAL_REFUND` ledger row |
| 9 | API manipulation | Add `"amount": 1` to the withdrawal body | Ignored; real cost is charged |

Run the scenario tests from the backend folder (see `tests/` and `TEST_RESULTS`).

## Final challenge: from 1,000 to 1,000,000 users

The current design is already correct (atomic updates, ledger, idempotency). At 1,000,000 users the work is mostly about throughput, isolation and operations.

**Database and transactions.** Keep money changes as single-document atomic updates where possible, since they are cheapest and cannot partially fail. Multi-document transactions (wallet + ledger + withdrawal) cost more under contention, so keep them short and never do network calls inside them. Shard `Wallet`, `WalletTransaction` and `Withdrawal` by `userId`; this keeps each user's operations on one shard and avoids cross-shard transactions. Use a replica set with majority write concern.

**Ledger architecture.** Treat the ledger as append-only and immutable (corrections are new rows, never edits). Partition or archive old ledger data by time: recent months stay hot, older data moves to cheaper storage. Optionally add per-user running checksums or periodic balance snapshots so reconciliation does not need to scan the full history.

**Idempotency.** Keep the unique `(userId, idempotencyKey)` index, and put a TTL or archival policy on old keys. Move key checks into Redis for a fast first line of defence, with the database index as the final guard.

**Indexing.** Compound indexes matching real queries: `(userId, createdAt desc)` for history, `(status, createdAt)` for the admin queue, `(userId, status)` for open-withdrawal counts. Review slow queries regularly and drop unused indexes, because every index slows writes.

**Queues.** Move non-critical work out of the request: audit log fan-out, notifications, emails, and the actual payout call to UPI/gift-card partners. A withdrawal request should only write the PENDING record, then a queue (BullMQ, SQS or Kafka) with retries and a dead-letter queue drives processing. Workers must be idempotent.

**Caching.** Cache payout methods/options (rarely change) in Redis or a CDN-friendly endpoint with short TTL, and invalidate on admin change. Do **not** cache balances as a source of truth; if a balance is cached for display, read from the database before any debit.

**Rate limiting.** Move from per-process limiters to a shared store (Redis) so limits work across many server instances. Add per-user, per-IP and per-device limits, with stricter limits on withdrawals and login.

**Fraud detection.** Rules and scoring on top of the audit trail: velocity limits, many accounts sharing a device/IP/UPI ID, new accounts withdrawing immediately, repeated rejected requests. Suspicious requests go to manual review instead of auto-processing. The existing "additional verification" response is the hook for this.

**Audit logs.** Write them to an append-only store (separate collection or log pipeline), with tamper-evident hashing for admin actions, and retain them per compliance needs.

**Reconciliation.** Run scheduled jobs that recompute each wallet from the ledger and compare it with the stored balance, and compare total VEs issued vs. redeemed vs. outstanding. Any mismatch raises an alert and blocks withdrawals for that user until reviewed.

**Monitoring and alerting.** Metrics (latency, error rate, transaction aborts, queue depth, pending-withdrawal age), structured logs with request IDs, tracing, and alerts on failed reconciliation, spikes in rejections or 5xx. Dashboards for the admin queue.

**Scalability.** Run the API stateless behind a load balancer with autoscaling (not on a sleeping free instance). Separate read traffic (history, dashboards) onto secondary reads or read replicas, keep writes on the primary. Split admin, payout workers and public API into separate deployable services, and use feature flags, backups and tested restore procedures for withdrawal reliability.
