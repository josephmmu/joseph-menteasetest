import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext();

function decodeTokenSafe(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function isExpired(decoded) {
  // exp is in seconds since epoch
  return !decoded?.exp ? false : decoded.exp * 1000 < Date.now();
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // { id, name, role, ... }
  const [loading, setLoading] = useState(true);

  // Initial restore
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = decodeTokenSafe(token);
      if (decoded && !isExpired(decoded)) {
        setUser(decoded);
      } else {
        localStorage.removeItem("token");
      }
    }
    setLoading(false);
  }, []);

  // Keep auth state in sync across tabs/windows
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "token") {
        const next = e.newValue;
        if (!next) {
          setUser(null);
          return;
        }
        const decoded = decodeTokenSafe(next);
        if (decoded && !isExpired(decoded)) {
          setUser(decoded);
        } else {
          localStorage.removeItem("token");
          setUser(null);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = (token) => {
    const decoded = decodeTokenSafe(token);
    if (!decoded || isExpired(decoded)) {
      // refuse to store a bad/expired token
      localStorage.removeItem("token");
      setUser(null);
      throw new Error("Invalid or expired token");
    }
    localStorage.setItem("token", token);
    setUser(decoded);
    //try { window.dispatchEvent(new Event('auth-token-changed')); } catch {}
  };

  // In your AuthContext.jsx, add this method:
  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    // Also update the token if provided
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        if (decoded.program !== updatedUser.program) {
          // Token needs to be updated - this would be handled by the API response
        }
      } catch (error) {
        console.error("Error updating user context:", error);
      }
    }
    //try { window.dispatchEvent(new Event('auth-token-changed')); } catch {}
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, login, logout, loading, updateUser }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
