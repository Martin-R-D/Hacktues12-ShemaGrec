import { useState } from "react";

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

const AUTH_INPUT_STYLE = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e8e4dc",
  fontSize: 13,
  outline: "none",
} as const;

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
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background:
          "radial-gradient(circle at 20% 0%, rgba(226,75,74,0.14), transparent 45%), linear-gradient(180deg, #111316 0%, #0a0c0e 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 22,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(20,22,24,0.95)",
          boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
        }}
      >
        <h1 style={{ margin: 0, color: "#f7f4ee", fontSize: 22 }}>Sign In</h1>
        <p
          style={{
            margin: "8px 0 18px",
            color: "rgba(232,228,220,0.68)",
            fontSize: 13,
          }}
        >
          Use your username and password
        </p>

        <label
          htmlFor="auth-username"
          style={{
            display: "block",
            marginBottom: 6,
            fontSize: 12,
            color: "rgba(232,228,220,0.7)",
          }}
        >
          Username
        </label>
        <input
          id="auth-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={AUTH_INPUT_STYLE}
          placeholder="your_username"
          autoComplete="username"
        />

        <label
          htmlFor="auth-password"
          style={{
            display: "block",
            margin: "12px 0 6px",
            fontSize: 12,
            color: "rgba(232,228,220,0.7)",
          }}
        >
          Password
        </label>
        <input
          id="auth-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={AUTH_INPUT_STYLE}
          placeholder="password"
          type="password"
          autoComplete="current-password"
        />

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(226,75,74,0.13)",
              color: "#E24B4A",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={() => {
            void submitSignIn();
          }}
          disabled={loading || username.trim().length === 0 || password.length === 0}
          style={{
            width: "100%",
            marginTop: 14,
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            cursor: loading ? "default" : "pointer",
            background: loading ? "rgba(255,255,255,0.18)" : "#E24B4A",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {loading ? "Please wait..." : "Sign In"}
        </button>

        <button
          onClick={onSwitchToSignUp}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "8px 0",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.16)",
            cursor: "pointer",
            background: "transparent",
            color: "rgba(232,228,220,0.85)",
            fontSize: 12,
          }}
        >
          Need an account? Sign Up
        </button>
      </div>
    </div>
  );
}
