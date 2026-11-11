import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errMsg, register, setToken } from "../api";
import "./Login.css";

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError("");

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Name, email, and password are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await register(name.trim(), email.trim(), password);
      setToken(data.token);
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
        <button type="button" className="login-back" onClick={() => navigate(-1)} aria-label="Go back">
          <span aria-hidden="true">←</span> Back
        </button>
      </header>

      <main className="login-main">
        <h2 className="login-heading">Create Your Account</h2>
        <form className="login-card signup-card" onSubmit={handleSubmit} noValidate>
          <label htmlFor="signup-name" className="login-label">Name :</label>
          <input id="signup-name" type="text" className="login-input" placeholder="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />

          <label htmlFor="signup-email" className="login-label">Email :</label>
          <input id="signup-email" type="email" className="login-input" placeholder="Email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />

          <label htmlFor="signup-password" className="login-label">Password :</label>
          <input id="signup-password" type="password" className="login-input" placeholder="Password (minimum 8 characters)" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />

          <label htmlFor="signup-confirm-password" className="login-label">Confirm Password :</label>
          <input id="signup-confirm-password" type="password" className="login-input" placeholder="Confirm Password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p className="login-signup">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
