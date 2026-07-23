import { useState } from "react";

const C = {
  bg: "#0A0A0A",
  card: "#141414",
  line: "#2E2E2E",
  accent: "#E11D2E",
  text: "#F5F5F5",
  mute: "#8A8A8A",
  red: "#FF4D4D",
};

export const PASSCODE = "3664";
export const UNLOCK_KEY = "munyon-unlocked";

export function isUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUnlocked(value) {
  try {
    if (value) localStorage.setItem(UNLOCK_KEY, "1");
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Simple passcode gate for a single-user money plan on a public URL.
 * Stays unlocked on this device until you tap Lock.
 */
export default function AuthGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (code.trim() !== PASSCODE) {
      setError("Wrong passcode");
      setCode("");
      return;
    }
    setUnlocked(true);
    setError("");
    onUnlock?.();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'Outfit', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "32px 20px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 400, width: "100%", margin: "0 auto" }}>
        <div
          style={{
            fontSize: 13,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.accent,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Munyon
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            margin: "0 0 8px",
            lineHeight: 1.2,
          }}
        >
          Enter passcode
        </h1>
        <p style={{ color: C.mute, margin: "0 0 28px", lineHeight: 1.5, fontSize: 15 }}>
          One unlock keeps this phone open. Tap Lock in the header when you want the gate back.
        </p>

        <form onSubmit={submit}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              color: C.mute,
              marginBottom: 8,
            }}
          >
            Passcode
          </label>
          <input
            type="password"
            autoComplete="current-password"
            inputMode="text"
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError("");
            }}
            placeholder="••••••••"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: C.card,
              border: `1px solid ${error ? C.red : C.line}`,
              borderRadius: 10,
              padding: "14px 16px",
              color: C.text,
              fontFamily: "inherit",
              fontSize: 16,
              marginBottom: 12,
              outline: "none",
              letterSpacing: "0.12em",
            }}
          />
          {error ? (
            <p style={{ color: C.red, fontSize: 13, margin: "0 0 12px" }}>{error}</p>
          ) : null}
          <button
            type="submit"
            style={{
              width: "100%",
              background: C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "14px 16px",
              fontFamily: "inherit",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
