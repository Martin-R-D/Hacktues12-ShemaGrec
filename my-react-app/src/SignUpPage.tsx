import { useState } from "react";
import "./SignUpPage.css";

type SignUpPageProps = {
  onAuthenticated: (username: string) => void;
  onSwitchToSignIn: () => void;
};

type AuthResponse = {
  token: string;
  username: string;
};

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:8004";
const AUTH_TOKEN_KEY = "saferoute_auth_token";
const AUTH_USERNAME_KEY = "saferoute_auth_username";

export default function SignUpPage({
  onAuthenticated,
  onSwitchToSignIn,
}: SignUpPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitSignUp = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetch(`${AUTH_API_URL}/auth/signUp`, {
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
    <div className="signup-root">
      <div className="signup-card">
        <h1 className="signup-title">Sign Up</h1>
        <p className="signup-subtitle">Create account to save map points later</p>

        <label htmlFor="auth-username" className="signup-label">
          Username
        </label>
        <input
          id="auth-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="signup-input"
          placeholder="your_username"
          autoComplete="username"
        />

        <label htmlFor="auth-password" className="signup-label--spaced">
          Password
        </label>
        <input
          id="auth-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="signup-input"
          placeholder="password"
          type="password"
          autoComplete="new-password"
        />

        {error && (
          <div className="signup-error">{error}</div>
        )}

        <button
          onClick={() => {
            void submitSignUp();
          }}
          disabled={loading || username.trim().length === 0 || password.length === 0}
          className="signup-btn-primary"
        >
          {loading ? "Please wait..." : "Sign Up"}
        </button>

        <button onClick={onSwitchToSignIn} className="signup-btn-secondary">
          Already have account? Sign In
        </button>
      </div>
    </div>
  );
}
