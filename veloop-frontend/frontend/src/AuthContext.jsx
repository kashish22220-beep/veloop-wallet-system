import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getMe, getToken, setToken, login as apiLogin } from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      return;
    }

    getMe()
      .then((data) => {
        setUser(data.user);
        setAuthed(true);
      })
      .catch(() => {
        setToken(null);
        setAuthed(false);
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    setToken(data.token);
    setUser(data.user);
    setAuthed(true);
  };
  const logout = () => {
    setToken(null);
    setAuthed(false);
    setUser(null);
  };
  return <Ctx.Provider value={{ authed, user, checking, login, logout }}>{children}</Ctx.Provider>;
}

export function Protected({ children }) {
  const { authed, checking } = useAuth();
  if (checking) return null;
  return authed ? children : <Navigate to="/login" replace />;
}

export function AdminProtected({ children }) {
  const { authed, user, checking } = useAuth();
  if (checking) return null;
  if (!authed) return <Navigate to="/login" replace />;
  return user?.role === "admin" ? children : <Navigate to="/wallet" replace />;
}
