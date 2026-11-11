import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errMsg } from "../api";
import { useAuth } from "../AuthContext";
import "./Login.css";

const googleLoginUrl = `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}`.replace(/\/$/, "") + "/auth/google";

export default function Login() {
  const navigate = useNavigate();
    const { login } = useAuth(); 
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") === "google_auth_failed"
      ? "Google login failed. Please try again."
      : ""
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // double-click protection
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
navigate("/wallet");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <header className="login-topbar">
        <button
          type="button"
          className="login-back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <span aria-hidden="true">←</span> Back
        </button>
      </header>

      <main className="login-main">
        <h2 className="login-heading">Login To Your Account</h2>

        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <a className="login-google" href={googleLoginUrl}>
            <span className="login-google-icon" aria-hidden="true">G</span>
            Continue with Google
          </a>

          <div className="login-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <label htmlFor="email" className="login-label">
            Email :
          </label>
          <input
            id="email"
            type="email"
            className="login-input"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="password" className="login-label">
            Password :
          </label>
          <input
            id="password"
            type="password"
            className="login-input"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="login-forgot">
            <Link to="/forgot-password">Forgot Password?</Link>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <p className="login-signup">
            Don't have an account? <Link to="/signup">Create Account</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
