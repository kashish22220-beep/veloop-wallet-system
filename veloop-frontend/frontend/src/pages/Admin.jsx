import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import PageHeader from "../components/PageHeader.jsx";
import "./Admin.css";

const currencies = ["ves", "sves", "gems", "tokens", "spins"];
const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");
const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
}) : "—";
const title = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function Admin() {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState({ items: [], page: 1, totalPages: 1, total: 0 });
  const [transactions, setTransactions] = useState({ items: [], page: 1, totalPages: 1 });
  const [withdrawals, setWithdrawals] = useState({ items: [], page: 1, totalPages: 1 });
  const [payouts, setPayouts] = useState({ methods: [], options: [] });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewResponse, usersResponse, transactionResponse, withdrawalResponse, payoutResponse] = await Promise.all([
        api("/api/admin/overview"),
        api("/api/admin/users?page=1&limit=8"),
        api("/api/admin/transactions?page=1&limit=8"),
        api("/api/admin/withdrawals?page=1&limit=8"),
        api("/api/admin/payouts"),
      ]);
      setOverview(overviewResponse.overview);
      setUsers({ items: usersResponse.users, page: usersResponse.page, totalPages: usersResponse.totalPages, total: usersResponse.total });
      setTransactions({ items: transactionResponse.transactions, page: transactionResponse.page, totalPages: transactionResponse.totalPages });
      setWithdrawals({ items: withdrawalResponse.withdrawals, page: withdrawalResponse.page, totalPages: withdrawalResponse.totalPages });
      setPayouts({ methods: payoutResponse.methods, options: payoutResponse.options });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const searchUsers = async (event) => {
    event.preventDefault();
    setBusy("users");
    try {
      const response = await api(`/api/admin/users?page=1&limit=8&search=${encodeURIComponent(search)}`);
      setUsers({ items: response.users, page: response.page, totalPages: response.totalPages, total: response.total });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const changeUserStatus = async (userId, accountStatus) => {
    setBusy(userId);
    try {
      const response = await api(`/api/admin/users/${userId}/status`, { method: "PATCH", body: { accountStatus } });
      setUsers((current) => ({ ...current, items: current.items.map((user) => user.id === userId ? response.user : user) }));
      setNotice("User status updated.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const changeWithdrawalStatus = async (withdrawal, status) => {
    const rejectionReason = status === "REJECTED" ? window.prompt("Reason for rejection:") : null;
    if (status === "REJECTED" && !rejectionReason?.trim()) return;
    setBusy(withdrawal.withdrawalId);
    try {
      const response = await api(`/api/admin/withdrawals/${withdrawal.withdrawalId}/status`, {
        method: "POST",
        body: { status, rejectionReason: rejectionReason?.trim() || null },
      });
      setWithdrawals((current) => ({
        ...current,
        items: current.items.map((item) => item.withdrawalId === withdrawal.withdrawalId ? response.withdrawal : item),
      }));
      setNotice(`Withdrawal marked ${title(status)}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const updateOption = async (option) => {
    setBusy(option.optionId);
    try {
      const response = await api(`/api/admin/payout/options/${option.optionId}`, {
        method: "PATCH",
        body: {
          active: option.active,
          payoutValue: Number(option.payoutValue),
          requiredAmount: Number(option.requiredAmount),
        },
      });
      setPayouts((current) => ({ ...current, options: current.options.map((item) => item.optionId === option.optionId ? response.option : item) }));
      setNotice("Payout option saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="admin-page"><PageHeader title="Admin Console" backTo="/wallet" /><p className="admin-state">Loading admin dashboard...</p></div>;
  if (!overview) return <div className="admin-page"><PageHeader title="Admin Console" backTo="/wallet" /><p className="admin-error">{error || "Could not load the admin dashboard."}</p><button className="admin-retry" onClick={load}>Try again</button></div>;

  return (
    <div className="admin-page">
      <PageHeader title="Admin Console" backTo="/wallet" />
      <main className="admin-wrap">
        <div className="admin-intro">
          <div>
            <p className="admin-kicker">Operations center</p>
            <h1>Keep VELoop moving.</h1>
            <p>Monitor rewards, review payouts, and manage the community from one place.</p>
          </div>
          <button className="admin-refresh" onClick={load}>↻ Refresh data</button>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}

        <section className="admin-metrics">
          <Metric label="Total users" value={formatNumber(overview.users)} detail={`${formatNumber(overview.activeUsers)} active`} icon="◎" />
          <Metric label="Pending reviews" value={formatNumber(overview.pendingWithdrawals)} detail="Withdrawals to process" icon="↗" tone="gold" />
          <Metric label="Ledger entries" value={formatNumber(overview.transactions)} detail="All wallet activity" icon="≡" />
          <Metric label="VEs in wallets" value={formatNumber(overview.balances.ves)} detail="Across all users" icon="◈" tone="green" />
        </section>

        <div className="admin-tabs" role="tablist">
          {[
            ["overview", "Overview"],
            ["users", "Users"],
            ["transactions", "Transactions"],
            ["withdrawals", "Withdrawals"],
            ["payouts", "Payout management"],
          ].map(([value, label]) => (
            <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>

        {tab === "overview" && <Overview overview={overview} withdrawals={withdrawals.items} onReview={() => setTab("withdrawals")} />}
        {tab === "users" && <UsersView users={users} search={search} setSearch={setSearch} onSearch={searchUsers} onStatus={changeUserStatus} busy={busy} />}
        {tab === "transactions" && <TransactionsView transactions={transactions} />}
        {tab === "withdrawals" && <WithdrawalsView withdrawals={withdrawals} onStatus={changeWithdrawalStatus} busy={busy} />}
        {tab === "payouts" && <PayoutsView payouts={payouts} onSave={updateOption} busy={busy} onChange={(option) => setPayouts((current) => ({ ...current, options: current.options.map((item) => item.optionId === option.optionId ? option : item) }))} />}
      </main>
    </div>
  );
}

function Metric({ label, value, detail, icon, tone = "" }) {
  return <article className={`admin-metric ${tone}`}><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function Overview({ overview, withdrawals, onReview }) {
  return (
    <div className="admin-grid">
      <section className="admin-card balance-monitor">
        <div className="admin-card-heading"><div><p className="admin-kicker">Wallet monitor</p><h2>Currency circulation</h2></div><span className="admin-live">Live</span></div>
        <div className="circulation-list">{currencies.map((currency) => <div key={currency}><span>{currency.toUpperCase()}</span><strong>{formatNumber(overview.balances[currency])}</strong><i style={{ width: `${Math.min(100, (overview.balances[currency] / Math.max(overview.balances.ves, 1)) * 100)}%` }} /></div>)}</div>
      </section>
      <section className="admin-card">
        <div className="admin-card-heading"><div><p className="admin-kicker">Needs attention</p><h2>Latest withdrawals</h2></div><button className="admin-link" onClick={onReview}>Review all →</button></div>
        {withdrawals.slice(0, 4).map((item) => <div className="mini-row" key={item.withdrawalId}><span className="mini-avatar">↗</span><div><strong>{item.user?.name || "User"}</strong><small>{title(item.method)} · ₹{formatNumber(item.payoutAmount)}</small></div><Status value={item.status} /></div>)}
        {withdrawals.length === 0 && <p className="admin-muted">No withdrawal requests yet.</p>}
      </section>
    </div>
  );
}

function UsersView({ users, search, setSearch, onSearch, onStatus, busy }) {
  return <section className="admin-card admin-table-card">
    <div className="admin-card-heading"><div><p className="admin-kicker">Directory</p><h2>User management <small>{users.total} total</small></h2></div><form className="admin-search" onSubmit={onSearch}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" /><button disabled={busy === "users"}>Search</button></form></div>
    <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>User</th><th>Status</th><th>Level</th><th>VEs balance</th><th>Joined</th><th>Action</th></tr></thead><tbody>{users.items.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td><Status value={user.accountStatus} /></td><td>Lvl {user.level}</td><td>{formatNumber(user.wallet.ves)}</td><td>{formatDate(user.createdAt)}</td><td><select value={user.accountStatus} disabled={busy === user.id} onChange={(event) => onStatus(user.id, event.target.value)}><option value="active">Active</option><option value="suspended">Suspend</option><option value="blocked">Block</option></select></td></tr>)}</tbody></table></div>
    {users.items.length === 0 && <p className="admin-muted">No users match this search.</p>}
  </section>;
}

function TransactionsView({ transactions }) {
  return <section className="admin-card admin-table-card"><div className="admin-card-heading"><div><p className="admin-kicker">Immutable ledger</p><h2>Transaction history</h2></div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Transaction</th><th>User</th><th>Movement</th><th>Source</th><th>Status</th><th>Date</th></tr></thead><tbody>{transactions.items.map((item) => <tr key={item.transactionId}><td><strong>{item.transactionId.slice(0, 14)}…</strong><small>{item.description || "Wallet movement"}</small></td><td><strong>{item.user?.name || "—"}</strong><small>{item.user?.email || ""}</small></td><td className={item.type === "CREDIT" ? "admin-positive" : "admin-negative"}>{item.type === "CREDIT" ? "+" : "-"}{formatNumber(item.amount)} {item.currency.toUpperCase()}</td><td>{title(item.source)}</td><td><Status value={item.status} /></td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody></table></div></section>;
}

function WithdrawalsView({ withdrawals, onStatus, busy }) {
  return <section className="admin-card admin-table-card"><div className="admin-card-heading"><div><p className="admin-kicker">Approval queue</p><h2>Withdrawal approvals</h2></div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>User</th><th>Method</th><th>Debit</th><th>Payout</th><th>Status</th><th>Review</th></tr></thead><tbody>{withdrawals.items.map((item) => <tr key={item.withdrawalId}><td><strong>{item.user?.name || "—"}</strong><small>{item.user?.email || ""}</small></td><td>{title(item.method)}<small>{item.optionId}</small></td><td>{formatNumber(item.currencyAmount)} {item.currency.toUpperCase()}</td><td className="admin-positive">₹{formatNumber(item.payoutAmount)}</td><td><Status value={item.status} /></td><td className="action-group">{item.status === "PENDING" && <button disabled={busy === item.withdrawalId} onClick={() => onStatus(item, "PROCESSING")}>Process</button>}{["PENDING", "PROCESSING"].includes(item.status) && <><button disabled={busy === item.withdrawalId} onClick={() => onStatus(item, "APPROVED")}>Approve</button><button className="danger" disabled={busy === item.withdrawalId} onClick={() => onStatus(item, "REJECTED")}>Reject</button></>}</td></tr>)}</tbody></table></div></section>;
}

function PayoutsView({ payouts, onSave, onChange, busy }) {
  const methodById = useMemo(() => new Map(payouts.methods.map((method) => [method.methodId, method])), [payouts.methods]);
  return <section className="admin-card admin-table-card"><div className="admin-card-heading"><div><p className="admin-kicker">Reward catalogue</p><h2>Payout management</h2></div></div><div className="payout-admin-grid">{payouts.options.map((option) => { const method = methodById.get(option.methodId); return <article className="payout-admin-card" key={option.optionId}><div className="payout-admin-top"><span className="payout-method">{method?.name || option.methodId}</span><label className="toggle"><input type="checkbox" checked={option.active} onChange={(event) => onChange({ ...option, active: event.target.checked })} /><span /></label></div><strong>₹{formatNumber(option.payoutValue)} voucher</strong><small>{option.optionId} · {option.requiredCurrency.toUpperCase()}</small><div className="payout-fields"><label>Required amount<input type="number" min="1" value={option.requiredAmount} onChange={(event) => onChange({ ...option, requiredAmount: event.target.value })} /></label><label>Payout value<input type="number" min="1" value={option.payoutValue} onChange={(event) => onChange({ ...option, payoutValue: event.target.value })} /></label></div><button className="admin-save" disabled={busy === option.optionId} onClick={() => onSave(option)}>{busy === option.optionId ? "Saving..." : "Save option"}</button></article>; })}</div></section>;
}

function Status({ value }) {
  return <span className={`admin-status status-${String(value || "").toLowerCase()}`}>{title(value)}</span>;
}
