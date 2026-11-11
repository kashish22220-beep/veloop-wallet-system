import { Navigate } from "react-router-dom";
import { getToken } from "../api";

// Only a convenience for the UI. The real protection is the JWT check on the backend.
export default function ProtectedRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}