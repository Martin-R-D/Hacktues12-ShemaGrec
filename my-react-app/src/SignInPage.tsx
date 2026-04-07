import { useState } from "react";
import "./SignInPage.css";

type SignInPageProps = {
  onAuthenticated: (username: string) => void;
  onSwitchToSignUp: () => void;
};

type AuthResponse = {
  token: string;
  username: string;
};

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:8004";
const AUTH_TOKEN_KEY = "saferoute_auth_token";
const AUTH_USERNAME_KEY = "saferoute_auth_username";

export default function SignInPage({
  onAuthenticated,
  onSwitchToSignUp,
}: SignInPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetch(`${AUTH_API_URL}/auth/signIn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      if (!result.ok) {
        const errorPayload = (await result.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errorPayload?.error ?? "Authentication failed");
      }

      const payload = (await result.json()) as AuthResponse;
      window.localStorage.setItem(AUTH_TOKEN_KEY, payload.token);
      window.localStorage.setItem(AUTH_USERNAME_KEY, payload.username);
      onAuthenticated(payload.username);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="background signin-root">
      <div className="signin-card">
        <h1 className="signin-title">Sign In</h1>
        <p className="signin-subtitle">Use your username and password</p>

        <label htmlFor="auth-username" className="signin-label">
          Username
        </label>
        <input
          id="auth-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="signin-input"
          placeholder="your_username"
          autoComplete="username"
        />

        <label htmlFor="auth-password" className="signin-label--spaced">
          Password
        </label>
        <input
          id="auth-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="signin-input"
          placeholder="password"
          type="password"
          autoComplete="current-password"
        />

        {error && (
          <div className="signin-error">{error}</div>
        )}

        <button
          onClick={() => {
            void submitSignIn();
          }}
          disabled={loading || username.trim().length === 0 || password.length === 0}
          className="signin-btn-primary"
        >
          {loading ? "Please wait..." : "Sign In"}
        </button>

        <button onClick={onSwitchToSignUp} className="signin-btn-secondary">
          Need an account? Sign Up
        </button>
      </div>
    </div>
  );
}
