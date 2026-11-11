# VELoop Wallet – Demo Frontend

```bash
npm install
cp .env.example .env     # set VITE_API_URL to your backend
npm run dev              # http://localhost:5173
```

Routes: `/login`, `/wallet`, `/payout`.

## Backend contract this UI expects
| Call | Response shape |
|---|---|
| `POST /auth/login` {email,password} | `{ token }` |
| `GET /wallet` | `{ wallet: { ves, sves, gems, tokens, spins } }` |
| `GET /wallet/transactions?page&limit` | `{ transactions:[{transactionId,type,amount,currency,description,status,createdAt}], pagination:{page,pages} }` |
| `GET /payout/methods` | `{ methods:[{ method, name }] }` |
| `GET /payout/options/:method` | `{ options:[{ optionId, payoutValue, requiredAmount, active, eligible }] }` |
| `POST /withdrawals` + `Idempotency-Key` header | body `{ method, optionId, payoutDetails }` -> `{ withdrawal:{ status } }` |

If your field names differ, change them in `src/api.js` and the two pages.
The frontend never sends an amount: the backend looks up `optionId`.
