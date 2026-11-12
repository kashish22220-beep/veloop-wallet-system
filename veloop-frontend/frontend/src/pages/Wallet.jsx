import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import PageHeader from "../components/PageHeader.jsx";
import "./pages.css";

const CURRENCY_LABEL = { ves: "VEs", sves: "SVEs", gems: "Gems", tokens: "Tokens", spins: "Spins" };
const num = (n) => Number(n || 0).toLocaleString("en-US");
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateTime = (value) => (value ? new Date(value).toLocaleString("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
}) : "—");
const displayName = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const methodLogo = {
  upi: "UPI",
  amazon: "a",
  google_play: "▶",
  paypal: "P",
};

export default function Wallet() {
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [tx, setTx] = useState({ items: [], page: 1, totalPages: 1, loading: false, error: "" });
  const [withdrawals, setWithdrawals] = useState({ items: [], page: 1, totalPages: 1, loading: false, error: "" });

  // Everything shown here comes from the backend. Nothing is stored in the browser.
  const loadMain = useCallback(async () => {
    setError("");
    try {
      const [s, m] = await Promise.all([api("/api/wallet/summary"), api("/api/payout/methods")]);
      setSummary(s.summary);
      setMethods(m.methods);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadTransactions = useCallback(async (page) => {
    setTx((t) => ({ ...t, loading: true, error: "" }));
    try {
      const r = await api(`/api/wallet/transactions?page=${page}&limit=10`);
      setTx({ items: r.transactions, page: r.page, totalPages: r.totalPages, loading: false, error: "" });
    } catch (e) {
      setTx((t) => ({ ...t, loading: false, error: e.message }));
    }
  }, []);

  const loadWithdrawals = useCallback(async (page) => {
    setWithdrawals((current) => ({ ...current, loading: true, error: "" }));
    try {
      const r = await api(`/api/withdrawals?page=${page}&limit=8`);
      setWithdrawals({
        items: r.withdrawals,
        page: r.page,
        totalPages: r.totalPages,
        loading: false,
        error: "",
      });
    } catch (e) {
      setWithdrawals((current) => ({ ...current, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    loadMain().finally(() => setLoading(false));
  }, [loadMain]);

  useEffect(() => {
    if (tab === "overview" && tx.items.length === 0) loadTransactions(1);
    if (tab === "transactions" && tx.items.length === 0) loadTransactions(1);
    if (tab === "withdrawals" && withdrawals.items.length === 0) loadWithdrawals(1);
  }, [tab, loadTransactions, loadWithdrawals, tx.items.length, withdrawals.items.length]);

  const refresh = async () => {
    setRefreshing(true);
    await loadMain();
    if (tab === "overview" || tab === "transactions") await loadTransactions(tx.page);
    if (tab === "withdrawals") await loadWithdrawals(withdrawals.page);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="pg">
        <PageHeader title="Wallet" backTo="/" />
        <p className="pg-state">Loading your wallet...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="pg">
        <PageHeader title="Wallet" backTo="/" />
        <div className="pg-wrap">
          <p className="pg-error" role="alert">{error || "Could not load your wallet."}</p>
          <button className="pg-link-btn" onClick={() => { setLoading(true); loadMain().finally(() => setLoading(false)); }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { wallet } = summary;

  return (
    <div className="pg">
      <PageHeader title="Wallet" backTo="/" />

      <main className="pg-wrap">
        {error && <p className="pg-error" role="alert">{error}</p>}

        <section className="balance-card" aria-label="Balance">
          <div className="badges">
            {summary.isVerified && <span className="badge">✔ Verified</span>}
            <span className="badge lvl">Lvl {summary.level}</span>
          </div>
          <button className="refresh-btn" onClick={refresh} disabled={refreshing} aria-label="Refresh wallet">
            ⟳
          </button>
          <p className="net-label">NET WORTH</p>
          <div className="ves-line">
            <span aria-hidden="true">🪙</span>
            <strong>{num(wallet.ves)}</strong>
            <span>Available VEs</span>
          </div>
          <div className="big-inr">{inr(summary.currentVesValueInr)}</div>
          <div className="sub-line">
            Current VEs Value &nbsp;|&nbsp; Lifetime: {inr(summary.lifetimeInr)}
          </div>
        </section>

        <section className="stats" aria-label="Wallet balances">
          {Object.entries(CURRENCY_LABEL).map(([currency, label]) => (
            <div className="stat" key={currency}>
              <div className="stat-ico" aria-hidden="true">{currency === "ves" ? "🪙" : "◆"}</div>
              <div><small>Available {label}</small><strong>{num(wallet[currency])}</strong></div>
            </div>
          ))}
          <div className="stat stat-highlight">
            <div className="stat-ico" aria-hidden="true">⬆</div>
            <div><small>Withdrawn</small><strong>{inr(summary.withdrawnInr)}</strong></div>
          </div>
          <div className="stat">
            <div className="stat-ico" aria-hidden="true">🏆</div>
            <div><small>Current Rank</small><strong>Lvl {summary.level}</strong></div>
          </div>
        </section>

        <section className="panel">
          <div className="tabs" role="tablist">
            <button role="tab" className="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </button>
            <button role="tab" className="tab" aria-selected={tab === "methods"} onClick={() => setTab("methods")}>
              Withdraw funds
            </button>
            <button role="tab" className="tab" aria-selected={tab === "transactions"} onClick={() => setTab("transactions")}>
              Transactions
            </button>
            <button role="tab" className="tab" aria-selected={tab === "withdrawals"} onClick={() => setTab("withdrawals")}>
              Withdrawals
            </button>
          </div>

          {tab === "overview" && (
            <div className="overview">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Your activity</p>
                  <h2>Recent transactions</h2>
                </div>
                <button className="text-btn" onClick={() => setTab("transactions")}>View all <span aria-hidden="true">→</span></button>
              </div>
              {tx.loading && <p className="pg-state compact">Loading activity...</p>}
              {!tx.loading && tx.error && <p className="pg-error" role="alert">{tx.error}</p>}
              {!tx.loading && !tx.error && tx.items.length === 0 && <p className="pg-state compact">Your wallet activity will appear here.</p>}
              {!tx.loading && !tx.error && tx.items.length > 0 && <TransactionList items={tx.items} />}
              <div className="overview-footer">
                <span>Withdrawals</span>
                <button className="text-btn" onClick={() => setTab("withdrawals")}>Track payout history <span aria-hidden="true">→</span></button>
              </div>
            </div>
          )}

          {tab === "methods" && (
            <>
              <div className="notice">
                ℹ {selected ? "Method selected. Continue to choose your voucher." : "Select a withdrawal method to continue."}
              </div>
              <h2>Withdraw Funds</h2>
              <p className="hint">Select your preferred withdrawal method</p>

              <div className="methods">
                {methods.map((m) => (
                  <button
                    key={m.method}
                    className="method"
                    disabled={!m.active}
                    aria-pressed={selected === m.method}
                    onClick={() => setSelected(m.method)}
                  >
                    <div className="method-top">
                      <div className={`method-logo method-logo-${m.method}`} aria-hidden="true">
                        <span>{methodLogo[m.method] || m.method.replace("_", " ")}</span>
                        {m.method === "amazon" && <small>amazon</small>}
                        {m.method === "google_play" && <small>Google Play</small>}
                      </div>
                      {m.active ? (
                        m.badge && <span className="method-badge">{m.badge}</span>
                      ) : (
                        <span aria-label="Unavailable">🔒</span>
                      )}
                    </div>
                    <strong>{m.name}</strong>
                    <span className="sub">{m.subtitle}</span>
                    <span className="note">{m.active ? m.note : m.unavailableReason || m.note}</span>
                  </button>
                ))}
              </div>

              <button
                className="continue-btn"
                disabled={!selected}
                onClick={() => navigate(`/payout?method=${selected}`)}
              >
                Continue Withdrawal →
              </button>
            </>
          )}

          {tab === "transactions" && (
            <>
              {tx.error && <p className="pg-error" role="alert">{tx.error}</p>}
              {tx.loading && <p className="pg-state">Loading transactions...</p>}
              {!tx.loading && !tx.error && tx.items.length === 0 && (
                <p className="pg-state">No transactions yet.</p>
              )}

              {!tx.loading && tx.items.length > 0 && (
                <TransactionList items={tx.items} />
              )}

              {tx.totalPages > 1 && (
                <div className="pager">
                  <button disabled={tx.page <= 1 || tx.loading} onClick={() => loadTransactions(tx.page - 1)}>
                    Previous
                  </button>
                  <span>Page {tx.page} of {tx.totalPages}</span>
                  <button disabled={tx.page >= tx.totalPages || tx.loading} onClick={() => loadTransactions(tx.page + 1)}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}

          {tab === "withdrawals" && (
            <WithdrawalHistory state={withdrawals} onPageChange={loadWithdrawals} />
          )}
        </section>
      </main>
    </div>
  );
}

function TransactionList({ items }) {
  return (
    <ul className="tx-list">
      {items.map((t) => (
        <li className="tx" key={t.transactionId}>
          <div className="tx-icon" aria-hidden="true">{t.type === "CREDIT" ? "↓" : "↑"}</div>
          <div className="tx-main">
            <div className="tx-desc">{t.description || displayName(t.source)}</div>
            <div className="tx-meta">{dateTime(t.createdAt)} · {displayName(t.source)}</div>
          </div>
          <div className={`tx-amount ${t.type === "CREDIT" ? "credit" : "debit"}`}>
            {t.type === "CREDIT" ? "+" : "-"}{num(t.amount)} {CURRENCY_LABEL[t.currency] || t.currency}
          </div>
          <div className={`tx-status tx-status-${String(t.status || "").toLowerCase()}`}>{displayName(t.status)}</div>
        </li>
      ))}
    </ul>
  );
}

function WithdrawalHistory({ state, onPageChange }) {
  if (state.loading) return <p className="pg-state">Loading withdrawal history...</p>;
  if (state.error) return <p className="pg-error" role="alert">{state.error}</p>;
  if (state.items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">↗</div>
        <h2>No withdrawals yet</h2>
        <p>When you redeem a reward, its status and payout details will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Payout activity</p>
          <h2>Withdrawal history</h2>
        </div>
        <span className="count-label">{state.items.length} shown</span>
      </div>
      <div className="withdrawal-list">
        {state.items.map((withdrawal) => (
          <article className="withdrawal-row" key={withdrawal.withdrawalId}>
            <div className="withdrawal-icon" aria-hidden="true">↗</div>
            <div className="withdrawal-main">
              <strong>{displayName(withdrawal.method)}</strong>
              <span>{dateTime(withdrawal.requestedAt)} · {num(withdrawal.currencyAmount)} {CURRENCY_LABEL[withdrawal.currency] || withdrawal.currency}</span>
            </div>
            <div className="withdrawal-payout">
              <strong>{inr(withdrawal.payoutAmount)}</strong>
              <span>Payout value</span>
            </div>
            <span className={`withdrawal-status status-${withdrawal.status.toLowerCase()}`}>
              {displayName(withdrawal.status)}
            </span>
          </article>
        ))}
      </div>
      {state.totalPages > 1 && (
        <div className="pager">
          <button disabled={state.page <= 1} onClick={() => onPageChange(state.page - 1)}>Previous</button>
          <span>Page {state.page} of {state.totalPages}</span>
          <button disabled={state.page >= state.totalPages} onClick={() => onPageChange(state.page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}