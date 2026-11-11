import { useEffect } from "react";
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth, Protected } from "./AuthContext.jsx";
import { setToken } from "./api";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Home from "./pages/Home.jsx";
import Wallet from "./pages/Wallet.jsx";
import Payout from "./pages/Payout.jsx";

function GoogleAuthSuccess() {
  const nav = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");

    if (token) {
      setToken(token);
      nav("/wallet", { replace: true });
      return;
    }

    nav("/login?error=google_auth_failed", { replace: true });
  }, [nav]);

  return <main className="auth-callback"><p>Completing Google sign-in…</p></main>;
}

export default function App() {
  const { authed, logout } = useAuth();
  const onHome = useLocation().pathname === "/";
  return (
    <>
      {!onHome && <header className="bar">
        <span className="logo">VELoop<i>Rewards</i></span>
        {authed && (
          <nav>
            <NavLink to="/wallet">Wallet</NavLink>
            <NavLink to="/payout">Payout</NavLink>
            <button className="link" onClick={logout}>Log out</button>
          </nav>
        )}
      </header>}
      {onHome ? <Home /> : <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/auth/google/success" element={<GoogleAuthSuccess />} />
          <Route path="/wallet" element={<Protected><Wallet /></Protected>} />
          <Route path="/payout" element={<Protected><Payout /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>}
    </>
  );
}
