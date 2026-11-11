import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import PageHeader from "../components/PageHeader.jsx";
import "./pages.css";

const num = (n) => Number(n).toLocaleString("en-US");

export default function Payout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const methodId = params.get("method");

  const [data, setData] = useState(null); // { method, options }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  // modal: null | "details" | "confirm" | "success"
  const [step, setStep] = useState(null);
  const [details, setDetails] = useState({});
  const [modalError, setModalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const idempotencyKey = useRef(null); // one key per confirmation
  const submittingRef = useRef(false); // blocks double-clicks instantly

  const load = useCallback(async () => {
    setError("");
    try {
      // Methods, vouchers, required VEs and the user's balance all come from the backend
      setData(await api(`/api/payout/options/${encodeURIComponent(methodId)}`));
    } catch (e) {
      setError(e.message);
    }
  }, [methodId]);

  useEffect(() => {
    if (!methodId) return;
    load().finally(() => setLoading(false));
  }, [methodId, load]);

  if (!methodId) return <Navigate to="/wallet" replace />;

  if (loading) {
    return (
      <div className="pg">
        <PageHeader title="Payout" backTo="/wallet" />
        <p className="pg-state">Loading vouchers...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pg">
        <PageHeader title="Payout" backTo="/wallet" />
        <div className="pg-wrap">
          <p className="pg-error" role="alert">{error || "Could not load payout options."}</p>
          <button className="pg-link-btn" onClick={() => navigate("/wallet")}>Back to Wallet</button>
        </div>
      </div>
    );
  }

  const { method, options } = data;
  const selected = options.find((o) => o.optionId === selectedId) || null;
  const canRedeem = !!selected && selected.canAfford && selected.eligible && selected.active;
  const shortBy = selected ? Math.max(0, selected.requiredAmount - selected.userBalance) : 0;

  const openDetails = () => {
    setDetails({});
    setModalError("");
    setStep("details");
  };

  const goConfirm = () => {
    for (const f of method.requiredFields) {
      if (!details[f.key] || !details[f.key].trim()) {
        setModalError(`${f.label} is required.`);
        return;
      }
    }
    setModalError("");
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setStep("confirm");
  };

  const confirm = async () => {
    if (submittingRef.current) return; // double-click guard
    submittingRef.current = true;
    setSubmitting(true);
    setModalError("");
    try {
      // Only WHICH option is sent. The backend looks up the real VEs and payout value.
      const res = await api("/api/withdrawals", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: { method: method.method, optionId: selected.optionId, payoutDetails: details },
      });
      setResult(res.withdrawal);
      idempotencyKey.current = null;
      setStep("success");
      load(); // refresh balances and progress bars
    } catch (e) {
      setModalError(e.message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    if (submitting) return;
    setStep(null);
  };

  return (
    <div className="pg">
      <PageHeader title="Payout" backTo="/wallet" />

      <main className="pg-wrap">
        <h2 className="pay-heading">Available Vouchers :</h2>
        <div className="pay-underline" />
        <p className="pay-desc">
          Redeem {method.name} vouchers instantly and enjoy hassle-free withdrawals.
        </p>

        {options.length === 0 && <p className="pg-state">No vouchers are available for this method yet.</p>}

        <div className="vouchers">
          {options.map((o) => {
            const pct = Math.min(100, (o.userBalance / o.requiredAmount) * 100);
            const unavailable = !o.active || !o.eligible;
            return (
              <button
                key={o.optionId}
                className="voucher"
                disabled={unavailable}
                aria-pressed={selectedId === o.optionId}
                onClick={() => setSelectedId(o.optionId)}
              >
                <div className="voucher-logo" aria-hidden="true">{method.method.toUpperCase().replace("_", " ")}</div>
                <div className="voucher-value"><span>₹</span>{num(o.payoutValue)}</div>
                <div className="voucher-need">
                  <span className="have">{num(Math.min(o.userBalance, o.requiredAmount))}</span> Of{" "}
                  <span className="req">{num(o.requiredAmount)}</span> VEs
                </div>
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="voucher-tag">
                  {!o.active ? "Unavailable" : !o.eligible ? "Not eligible" : o.canAfford ? "Ready to redeem" : ""}
                </div>
              </button>
            );
          })}
        </div>

        <div className="redeem-bar">
          {selected && !selected.canAfford && (
            <span className="redeem-hint">You need {num(shortBy)} more VEs for this voucher.</span>
          )}
          <button className="redeem-btn" disabled={!canRedeem} onClick={openDetails}>
            Redeem
          </button>
        </div>
      </main>

      {step && (
        <div className="modal-backdrop" onClick={step === "success" ? undefined : closeModal}>
          <div className="modal pg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ minHeight: 0, padding: 28 }}>
            {step === "details" && (
              <>
                <h3>Enter your {method.name} details</h3>
                {modalError && <p className="pg-error" role="alert">{modalError}</p>}
                {method.requiredFields.map((f) => (
                  <label className="field" key={f.key}>
                    <span>{f.label}</span>
                    <input
                      type={f.type === "email" ? "email" : "text"}
                      value={details[f.key] || ""}
                      onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                ))}
                <div className="modal-actions">
                  <button className="btn ghost" onClick={closeModal}>Cancel</button>
                  <button className="btn primary" onClick={goConfirm}>Continue</button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <h3>Are you sure you want to redeem this reward?</h3>
                {modalError && <p className="pg-error" role="alert">{modalError}</p>}
                <div className="summary">
                  <div><span>Payout</span><strong>₹{num(selected.payoutValue)}</strong></div>
                  <div><span>Required</span><strong>{num(selected.requiredAmount)} VEs</strong></div>
                  {method.requiredFields.map((f) => (
                    <div key={f.key}><span>{f.label}</span><strong>{details[f.key]}</strong></div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button className="btn ghost" onClick={() => setStep("details")} disabled={submitting}>Back</button>
                  <button className="btn ghost" onClick={closeModal} disabled={submitting}>Cancel</button>
                  <button className="btn primary" onClick={confirm} disabled={submitting}>
                    {submitting ? "Submitting..." : "Confirm"}
                  </button>
                </div>
              </>
            )}

            {step === "success" && result && (
              <>
                <div className="success-ico" aria-hidden="true">✅</div>
                <h3>Withdrawal submitted successfully.</h3>
                <div className="summary">
                  <div><span>Status</span><strong>{result.status === "PENDING" ? "Pending" : result.status}</strong></div>
                  <div><span>Payout</span><strong>₹{num(result.payoutAmount)}</strong></div>
                  <div><span>Deducted</span><strong>{num(result.currencyAmount)} VEs</strong></div>
                </div>
                <div className="modal-actions">
                  <button className="btn ghost" onClick={() => setStep(null)}>Stay here</button>
                  <button className="btn primary" onClick={() => navigate("/wallet")}>Back to Wallet</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}