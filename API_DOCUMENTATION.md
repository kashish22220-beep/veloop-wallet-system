# VELoop Rewards Wallet - API Documentation

**Base URL (live):** `https://veloop-wallet-syatem.onrender.com/api`
**Base URL (local):** `http://localhost:5000/api`

> Render free plan sleeps after inactivity. The first request can take 30-50 seconds.

## Conventions

- All bodies and responses are JSON.
- Every endpoint except `/auth/register`, `/auth/login` and `/auth/google*` needs a JWT:
  `Authorization: Bearer <token>`
- The user is always identified from the token. No endpoint accepts a `userId` for normal users.
- Errors use this shape:

```json
{ "success": false, "message": "Insufficient VEs balance.", "code": "INSUFFICIENT_BALANCE" }
```

| HTTP | Meaning |
|---|---|
| 400 | Validation failed / invalid request |
| 401 | Authentication required / invalid or expired token |
| 403 | Authenticated but not allowed (e.g. admin-only route) |
| 404 | Route or resource not found |
| 409 | Duplicate request (idempotency) |
| 429 | Rate limit exceeded |
| 500 | Internal error (details are never exposed) |

Common error codes: `INVALID_CURRENCY`, `INVALID_AMOUNT`, `INVALID_SOURCE`, `INSUFFICIENT_BALANCE`, `WALLET_NOT_FOUND`, `METHOD_UNAVAILABLE`, `OPTION_UNAVAILABLE`, `NOT_ELIGIBLE`, `INVALID_PAYOUT_DETAILS`, `VERIFICATION_REQUIRED`, `DUPLICATE_WITHDRAWAL`, `WITHDRAWAL_NOT_FOUND`, `INVALID_TRANSITION`, `CONFLICT`.

> Fields still marked **(verify)** were not confirmed against the controllers (response wrappers, `/wallet/summary`, auth responses). Check them before submitting.

---

## 1. Auth - `/api/auth`

| Method | Path | Auth | Rate limit |
|---|---|---|---|
| POST | `/auth/register` | No | `authLimiter` |
| POST | `/auth/login` | No | `authLimiter` |
| GET | `/auth/me` | JWT | - |
| GET | `/auth/google` | No | - |
| GET | `/auth/google/callback` | No | - |

### POST /auth/register
Request:
```json
{ "name": "Kash", "email": "kash@example.com", "password": "Passw0rd123" }
```
Password: minimum 8 characters. Response `201`/`200` **(verify)**:
```json
{ "success": true, "token": "<jwt>", "user": { "id": "...", "name": "Kash", "email": "kash@example.com" } }
```

### POST /auth/login
Request:
```json
{ "email": "kash@example.com", "password": "Passw0rd123" }
```
Response `200`:
```json
{ "success": true, "token": "<jwt>", "user": { "id": "...", "name": "Kash", "email": "kash@example.com" } }
```
Errors: `400` validation, `401` invalid credentials, `429` too many attempts.

### GET /auth/me
Returns the logged-in user. `401` if the token is missing or invalid.

### GET /auth/google
Redirects to Google sign-in. After success, `/auth/google/callback` issues a JWT and redirects the browser to the frontend (`CLIENT_ORIGIN`). On failure it redirects to `CLIENT_ORIGIN/login?error=google_auth_failed`.

---

## 2. Wallet - `/api/wallet`

All routes need a JWT.

| Method | Path | Who |
|---|---|---|
| GET | `/wallet` | User |
| GET | `/wallet/summary` | User |
| GET | `/wallet/transactions` | User |
| POST | `/wallet/credit` | **Admin only** |
| POST | `/wallet/debit` | **Admin only** |

### GET /wallet
```json
{
  "success": true,
  "wallet": { "ves": 25000, "sves": 5000, "gems": 100, "tokens": 500, "spins": 3 }
}
```

### GET /wallet/summary
Data for the Wallet dashboard (balances, withdrawn total, rank). Shape **(verify)**.

### GET /wallet/transactions?page=1&limit=20
Paginated ledger of the logged-in user.
```json
{
  "success": true,
  "page": 1,
  "limit": 20,
  "total": 5,
  "transactions": [
    {
      "transactionId": "...",
      "currency": "VES",
      "type": "DEBIT",
      "amount": 2400,
      "balanceBefore": 25000,
      "balanceAfter": 22600,
      "source": "WITHDRAWAL",
      "referenceId": "<withdrawalId>",
      "status": "COMPLETED",
      "description": "UPI withdrawal",
      "createdAt": "2026-11-11T10:00:00.000Z"
    }
  ]
}
```
Response key names **(verify)**.

### POST /wallet/credit  (admin)
Request fields **(verify with `adminCreditSchema`)**:
```json
{ "userId": "<targetUserId>", "currency": "ves", "amount": 500, "source": "ADMIN_CREDIT", "description": "Bonus" }
```
`currency` is one of `ves`, `sves`, `gems`, `tokens`, `spins` (lowercase). `amount` must be a positive whole number. `source` must be an allowed credit source. Exact request keys: see `adminCreditSchema`.
```text
```
Creates a CREDIT ledger entry and an audit log. Normal users get `403`.

### POST /wallet/debit  (admin)
Same shape as credit **(verify with `adminDebitSchema`)**. Rejects with `400` if balance is insufficient. Creates a DEBIT ledger entry and an audit log.

---

## 3. Payout - `/api/payout`

All routes need a JWT. Options come from the database, never from the frontend.

| Method | Path | Description |
|---|---|---|
| GET | `/payout/methods` | Available payout methods |
| GET | `/payout/options` | All options for all methods |
| GET | `/payout/options/:method` | Options for one method (e.g. `upi`) |

### GET /payout/methods
```json
{
  "success": true,
  "methods": [
    { "method": "upi", "name": "UPI Transfer" },
    { "method": "amazon", "name": "Amazon Pay" },
    { "method": "google_play", "name": "Google Play" }
  ]
}
```

### GET /payout/options/upi
```json
{
  "success": true,
  "options": [
    { "optionId": "upi_10", "payoutValue": 10, "requiredAmount": 2400, "currency": "VES", "active": true },
    { "optionId": "upi_100", "payoutValue": 100, "requiredAmount": 19500, "currency": "VES", "active": true }
  ]
}
```
Seeded UPI values: Rs10 = 2,400, Rs25 = 5,800, Rs50 = 10,000, Rs100 = 19,500, Rs150 = 28,500, Rs300 = 52,500, Rs500 = 80,500, Rs1000 = 150,000 VEs.
Errors: `400` for an invalid `:method` value.

---

## 4. Withdrawals - `/api/withdrawals`

All routes need a JWT.

| Method | Path | Rate limit |
|---|---|---|
| POST | `/withdrawals` | `withdrawalLimiter` |
| GET | `/withdrawals` | - |
| GET | `/withdrawals/:withdrawalId` | - |
| POST | `/withdrawals/:withdrawalId/cancel` | `withdrawalLimiter` |

### POST /withdrawals
Headers:
```
Authorization: Bearer <token>
Idempotency-Key: <unique string per user action, e.g. a UUID>
```
Body. The frontend sends **only** the method, option and details. It never sends an amount:
```json
{ "method": "upi", "optionId": "upi_10", "details": { "upiId": "name@bank" } }
```
The backend looks up `optionId`, checks the user's balance, deducts it, writes the ledger entry and creates the withdrawal in one flow.

Success:
```json
{ "success": true, "message": "Withdrawal submitted successfully.", "withdrawal": { "withdrawalId": "...", "status": "PENDING" } }
```
Errors:

| Case | Status | Message |
|---|---|---|
| Not enough VEs | 400 | Insufficient VEs balance. |
| Fake/unknown optionId | 400 | Selected payout option is unavailable. |
| Inactive method | 400 | This payout method is currently unavailable. |
| Same Idempotency-Key reused | Original withdrawal returned (no second deduction) | - |
| Wallet debit key collides inside a new request | 409 | This withdrawal request has already been submitted. (`DUPLICATE_WITHDRAWAL`) |
| Not eligible (level / verification) | 403 | You are not eligible for this payout option. (`NOT_ELIGIBLE`) |
| Too many open withdrawals | 403 | This request requires additional verification. (`VERIFICATION_REQUIRED`) |
| Bad payout details | 400 | e.g. "UPI ID is required." (`INVALID_PAYOUT_DETAILS`) |
| No token | 401 | Authentication required. |
| Too many requests | 429 | Rate limit message |

### GET /withdrawals?page=1&limit=20
The logged-in user's withdrawals (paginated). Query rules come from `listQuerySchema`.

### GET /withdrawals/:withdrawalId
One withdrawal. A user can only read their own; someone else's ID returns `404` (`WITHDRAWAL_NOT_FOUND`).

### POST /withdrawals/:withdrawalId/cancel
Cancels the logged-in user's own withdrawal (only if the status rules allow it, normally `PENDING`) and refunds the VEs with a `WITHDRAWAL_REFUND` ledger entry. If the status cannot change, returns `409` (`INVALID_TRANSITION`).

### Withdrawal statuses
`PENDING` -> `PROCESSING` -> `APPROVED`, or `REJECTED` / `CANCELLED`. A rejected or cancelled withdrawal refunds the VEs and writes a ledger record.

---

## 5. Admin - `/api/admin`

All routes need a JWT **and** `role = admin`. Normal users get `403`.

| Method | Path | Description |
|---|---|---|
| GET | `/admin/withdrawals` | List all withdrawals (paginated, filterable) |
| POST | `/admin/withdrawals/:withdrawalId/status` | Approve / reject / move to processing |
| PATCH | `/admin/payout/options/:optionId` | Change a payout option (active flag, required VEs etc.) |

### POST /admin/withdrawals/:withdrawalId/status
Body:
```json
{ "status": "REJECTED", "rejectionReason": "Invalid UPI ID", "reviewNote": "Checked manually" }
```
`status` is one of `PROCESSING`, `APPROVED`, `REJECTED`, `CANCELLED`. Allowed moves follow the status flow. An invalid move returns `409` (`INVALID_TRANSITION`); a concurrent update returns `409` (`CONFLICT`). `REJECTED` / `CANCELLED` refund the VEs once (refund is idempotent). Every call writes an audit log.

### PATCH /admin/payout/options/:optionId
Body **(verify with `updateOptionSchema`)**:
```json
{ "active": false }
```
Writes a "Payout Configuration Changed" audit log.

---

## 6. Rewards - `/api/rewards`

All reward routes require a JWT. Reward amounts and claim limits are enforced by the backend and each successful claim writes a wallet ledger entry plus a protected claim record.

| Method | Path | Description |
|---|---|---|
| GET | `/rewards/status` | Daily streak, ad quota, bonus and referral status |
| POST | `/rewards/daily` | Claim the daily check-in/streak reward once per day |
| POST | `/rewards/ad/session` | Start an expiring ad session before showing an ad |
| GET | `/rewards/ad/callback` | Public AdMob SSV callback; credits only after signature verification |
| POST | `/rewards/bonus` | Claim the one-time welcome bonus |
| POST | `/rewards/referral` | Apply another user's referral code |

Ad rewards are credited only by the AdMob server-side verification callback. The callback validates Google's signature, requires an unexpired session created by the authenticated app, enforces the daily cap, and is idempotent on the AdMob transaction ID. Configure AdMob `custom_data` with the returned `sessionId`.

---

## Security summary

- JWT authentication on all wallet, payout, withdrawal and admin routes.
- Role check (`requireRole('admin')`) on credit, debit and all admin routes.
- Input validation on every body, query and param (`validate` middleware).
- Rate limiters: `authLimiter` (login/register), `withdrawalLimiter`, `mutationLimiter`.
- Idempotency-Key on withdrawal creation.
- Payout amounts come from the database, never from the request.
- Audit logs for sensitive wallet and admin actions.
