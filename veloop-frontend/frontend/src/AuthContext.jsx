import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getMe, getToken, setToken, login as apiLogin } from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      return;
    }

    getMe()
      .then(() => setAuthed(true))
      .catch(() => {
        setToken(null);
        setAuthed(false);
      })
      .finally(() => setChecking(false));
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    setToken(data.token);
    setAuthed(true);
  };
  const logout = () => {
    setToken(null);
    setAuthed(false);
  };
  return <Ctx.Provider value={{ authed, checking, login, logout }}>{children}</Ctx.Provider>;
}

export function Protected({ children }) {
  const { authed, checking } = useAuth();
  if (checking) return null;
  return authed ? children : <Navigate to="/login" replace />;
}
