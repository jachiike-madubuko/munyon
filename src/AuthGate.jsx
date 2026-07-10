import { useState } from "react";
import { supabase } from "./lib/supabase";

const C = {
  bg: "#0A0A0A",
  card: "#141414",
  line: "#2E2E2E",
  accent: "#E11D2E",
  text: "#F5F5F5",
  mute: "#8A8A8A",
};

/**
 * Magic-link gate. Keeps money plans off the public URL until you sign in.
 */
export default function AuthGate() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const sendLink = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (err) {
      setStatus("error");
      setError(err.message);
      return;
    }
    setStatus("sent");
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
          Your paycheck plan, locked to you
        </h1>
        <p style={{ color: C.mute, margin: "0 0 28px", lineHeight: 1.5, fontSize: 15 }}>
          Sign in with a magic link. No password. Your plan syncs across devices and stays private.
        </p>

        {status === "sent" ? (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Check your email</div>
            <p style={{ color: C.mute, margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              We sent a link to <span style={{ color: C.text }}>{email.trim()}</span>. Open it on
              this phone to unlock your plan.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              style={{
                marginTop: 16,
                background: "transparent",
                border: "none",
                color: C.accent,
                fontFamily: "inherit",
                fontSize: 14,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendLink}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                color: C.mute,
                marginBottom: 8,
              }}
            >
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: C.card,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: "14px 16px",
                color: C.text,
                fontFamily: "inherit",
                fontSize: 16,
                marginBottom: 16,
                outline: "none",
              }}
            />
            {error ? (
              <p style={{ color: "#FF4D4D", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={status === "sending"}
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
                cursor: status === "sending" ? "wait" : "pointer",
                opacity: status === "sending" ? 0.7 : 1,
                minHeight: 48,
              }}
            >
              {status === "sending" ? "Sending link…" : "Email me a link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
