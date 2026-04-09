import { useCallback, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./App.css";
import SignInPage from "./SignInPage";
import SignUpPage from "./SignUpPage";
import SafetyMapApp from "./features/safetyMap/SafetyMapApp";
import {
  AUTH_TOKEN_KEY,
  AUTH_USERNAME_KEY,
} from "./features/safetyMap/constants";

type AuthMode = "signIn" | "signUp";

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [authToken, setAuthToken] = useState<string | null>(() =>
    window.localStorage.getItem(AUTH_TOKEN_KEY),
  );
  const [authUsername, setAuthUsername] = useState<string | null>(() =>
    window.localStorage.getItem(AUTH_USERNAME_KEY),
  );

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    setAuthUsername(null);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USERNAME_KEY);
    setAuthMode("signIn");
  }, []);

  if (!authToken) {
    if (authMode === "signUp") {
      return (
        <SignUpPage
          onAuthenticated={(username) => {
            setAuthToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
            setAuthUsername(username);
          }}
          onSwitchToSignIn={() => {
            setAuthMode("signIn");
          }}
        />
      );
    }

    return (
      <SignInPage
        onAuthenticated={(username) => {
          setAuthToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
          setAuthUsername(username);
        }}
        onSwitchToSignUp={() => {
          setAuthMode("signUp");
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <button onClick={handleLogout} className="logout-btn">
        {authUsername ? `Log out (${authUsername})` : "Log out"}
      </button>
      <SafetyMapApp authToken={authToken} />
    </div>
  );
}
