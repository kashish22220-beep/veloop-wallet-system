import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import PageHeader from "../components/PageHeader.jsx";
import "./Rewards.css";

const number = (value) => Number(value || 0).toLocaleString("en-US");

export default function Rewards() {
  const [rewards, setRewards] = useState(null);
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api("/api/rewards/status");
      setRewards(response.rewards);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const claim = async (type, options = {}) => {
    setBusy(type);
    setMessage("");
    setError("");
    try {
      if (type === "ad") {
        const response = await api("/api/rewards/ad/session", { method: "POST" });
        setMessage(`Ad session ready. The verified AdMob callback will credit ${response.session.amount} VEs after completion.`);
        return;
      }
      const response = await api(`/api/rewards/${type}`, { method: "POST", body: options });
      setMessage(response.message);
      if (type === "referral") setReferralCode("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="rewards-page"><PageHeader title="Rewards" backTo="/wallet" /><p className="rewards-state">Loading rewards...</p></div>;
  if (!rewards) return <div className="rewards-page"><PageHeader title="Rewards" backTo="/wallet" /><p className="rewards-error">{error || "Could not load rewards."}</p></div>;

  return (
    <div className="rewards-page">
      <PageHeader title="Rewards Hub" backTo="/wallet" />
      <main className="rewards-wrap">
        <div className="rewards-hero">
          <div><p className="rewards-kicker">Earn more VEs</p><h1>Your reward routine</h1><p>Check in daily, watch ads, and invite friends to grow your wallet.</p></div>
          <div className="reward-balance"><span>Available balance</span><strong>{number(rewards.balance)} VEs</strong></div>
        </div>
        {error && <p className="rewards-error" role="alert">{error}</p>}
        {message && <p className="rewards-message" role="status">{message}</p>}
        <section className="reward-grid">
          <article className="reward-card daily-card">
            <div className="reward-card-top"><span className="reward-icon">☀</span><span className="reward-tag">Daily</span></div>
            <h2>Daily check-in</h2>
            <p>Keep your streak alive and unlock bigger rewards each day.</p>
            <div className="reward-value">+{number(rewards.daily.nextReward)} <small>VEs next</small></div>
            <div className="streak-line"><span>Streak day {rewards.daily.streakDay || 0}</span><span>{rewards.daily.claimed ? "Claimed today" : "Ready now"}</span></div>
            <button className="reward-action" disabled={rewards.daily.claimed || busy === "daily"} onClick={() => claim("daily")}>{rewards.daily.claimed ? "Come back tomorrow" : busy === "daily" ? "Claiming..." : "Claim daily reward"}</button>
          </article>

          <article className="reward-card">
            <div className="reward-card-top"><span className="reward-icon purple">▶</span><span className="reward-tag">{rewards.ads.remaining} left today</span></div>
            <h2>Watch &amp; earn</h2>
            <p>Watch a sponsored video to receive a wallet reward.</p>
            <div className="reward-value">+{number(rewards.ads.amount)} <small>VEs per ad</small></div>
            <div className="streak-line"><span>{rewards.ads.claimedToday} watched today</span><span>Max 10 / day</span></div>
            <button className="reward-action purple-action" disabled={!rewards.ads.remaining || busy === "ad"} onClick={() => claim("ad")}>{busy === "ad" ? "Starting..." : rewards.ads.remaining ? "Start rewarded ad" : "Daily limit reached"}</button>
          </article>

          <article className="reward-card">
            <div className="reward-card-top"><span className="reward-icon gold">✦</span><span className="reward-tag">One time</span></div>
            <h2>Welcome bonus</h2>
            <p>Claim your starter bonus and begin your VELoop journey.</p>
            <div className="reward-value">+{number(rewards.bonus.amount)} <small>VEs</small></div>
            <div className="streak-line"><span>Starter reward</span><span>{rewards.bonus.claimed ? "Claimed" : "Available"}</span></div>
            <button className="reward-action gold-action" disabled={rewards.bonus.claimed || busy === "bonus"} onClick={() => claim("bonus")}>{rewards.bonus.claimed ? "Already claimed" : "Claim welcome bonus"}</button>
          </article>

          <article className="reward-card referral-card">
            <div className="reward-card-top"><span className="reward-icon green">↗</span><span className="reward-tag">Invite friends</span></div>
            <h2>Referral rewards</h2>
            <p>Share your code. You earn {number(rewards.referral.referrerAmount)} VEs when a friend joins.</p>
            <div className="referral-code"><span>Your code</span><strong>{rewards.referral.code || "Generating..."}</strong><button onClick={() => navigator.clipboard?.writeText(rewards.referral.code)} aria-label="Copy referral code">Copy</button></div>
            <div className="referral-entry"><input value={referralCode} onChange={(event) => setReferralCode(event.target.value)} placeholder="Friend's referral code" /><button disabled={!referralCode.trim() || busy === "referral"} onClick={() => claim("referral", { referralCode })}>Apply</button></div>
          </article>
        </section>
      </main>
    </div>
  );
}
