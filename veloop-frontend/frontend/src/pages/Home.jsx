import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

function Logo() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="26" fill="#111" />
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
        <path d="M28 10a18 18 0 1 1-17 12" />
        <path d="M28 17a11 11 0 1 1-10 7" />
        <path d="M28 24a4 4 0 1 1-3 3" />
      </g>
    </svg>
  );
}

const Coin = ({ className }) => <div className={`coin ${className}`}><span>$</span></div>;
const Btc = ({ className }) => <div className={`btc ${className}`}>₿</div>;

export default function Home() {
  const { authed, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="home">
      <header className="home-bar">
        <Link to="/" className="home-logo">
          <Logo />
          <span className="word"><b>VE</b>Loop</span>
        </Link>
       <div className="home-auth-buttons">
  <Link className="pill dark" to="/login">Login/SignUp</Link>
 
</div>
      </header>

      <section className="home-hero">
        <div className="glass">
          <span className="eyebrow"><span className="eyebrow-dot" /> Your time, your rewards</span>
          <h1>Earn Real Money Online – Watch Ads, Play Games, Complete Tasks &amp; More</h1>
          <p>
            Turn your free time into real income by joining the easiest and most trusted way to earn
            money online.<br />
            Get paid for watching ads, completing app tasks, solving captchas, and referring friends, etc.
          </p>
          <button className="pill dark big" onClick={() => nav(authed ? "/wallet" : "/login")}>
            Start Making Money Now
          </button>
          <p className="sub">
            Start today and explore how easy it is to boost your income anytime, anywhere.<br />
            Our platform offers multiple legit earning options, designed for everyone.
          </p>
          <div className="hero-points" aria-label="Platform benefits">
            <span>✓ Fast payouts</span>
            <span>✓ Simple tasks</span>
            <span>✓ Any device</span>
          </div>
        </div>

        <div className="stage" aria-hidden="true">
          <div className="tile gplay">Google Play</div>
          <div className="tile amazon">amazon.com<small>gift card</small></div>
          <div className="tile paypal">PayPal</div>
          <Coin className="c1" />
          <Coin className="c2" />
          <Btc className="b1" />
          <Btc className="b2" />
          <Btc className="b3" />
        </div>
      </section>
    </div>
  );
}
