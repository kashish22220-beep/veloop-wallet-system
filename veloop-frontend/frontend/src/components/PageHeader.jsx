import { useNavigate } from "react-router-dom";

export default function PageHeader({ title, backTo }) {
  const navigate = useNavigate();
  return (
    <header className="pg-topbar">
      <button
        type="button"
        className="pg-back"
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
        aria-label="Go back"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="pg-title">{title}</h1>
    </header>
  );
}