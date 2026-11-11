import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import PageHeader from "../components/PageHeader.jsx";
import "./pages.css";

const CURRENCY_LABEL = { ves: "VEs", sves: "SVEs", gems: "Gems", tokens: "Tokens", spins: "Spins" };
const num = (n) => Number(n).toLocaleString("en-US");
const inr = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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

  const [tab, setTab] = useState("methods");
  const [selected, setSelected] = useState(null);
  const [tx, setTx] = useState({ items: [], page: 1, totalPages: 1, loading: false, error: "" });

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

  useEffect(() => {
    loadMain().finally(() => setLoading(false));
  }, [loadMain]);

  useEffect(() => {
    if (tab === "history") loadTransactions(1);
  }, [tab, loadTransactions]);

  const refresh = async () => {
    setRefreshing(true);
    await loadMain();
    if (tab === "history") await loadTransactions(tx.page);
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
          <div className="stat">
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
            <button role="tab" className="tab" aria-selected={tab === "methods"} onClick={() => setTab("methods")}>
              Payment Methods
            </button>
            <button role="tab" className="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>
              Transactions History
            </button>
          </div>

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

          {tab === "history" && (
            <>
              {tx.error && <p className="pg-error" role="alert">{tx.error}</p>}
              {tx.loading && <p className="pg-state">Loading transactions...</p>}
              {!tx.loading && !tx.error && tx.items.length === 0 && (
                <p className="pg-state">No transactions yet.</p>
              )}

              {!tx.loading && tx.items.length > 0 && (
                <ul className="tx-list">
                  {tx.items.map((t) => (
                    <li className="tx" key={t.transactionId}>
                      <div>
                        <div className="tx-desc">{t.description || t.source}</div>
                        <div className="tx-meta">{new Date(t.createdAt).toLocaleString()}</div>
                      </div>
                      <div className={`tx-amount ${t.type === "CREDIT" ? "credit" : "debit"}`}>
                        {t.type === "CREDIT" ? "+" : "-"}
                        {num(t.amount)} {CURRENCY_LABEL[t.currency] || t.currency}
                      </div>
                      <div className="tx-meta">{t.source.replace(/_/g, " ")}</div>
                      <div className="tx-status">{t.status}</div>
                    </li>
                  ))}
                </ul>
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
        </section>
      </main>
    </div>
  );
}