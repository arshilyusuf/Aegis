import React, { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import LogViewer from "./components/LogViewer";
import PolicyConfig from "./components/PolicyConfig";
import {
  Shield,
  Activity,
  ScrollText,
  SlidersHorizontal,
  Terminal,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const tokens = {
  bg: "#09090b",
  surface: "#18181b",
  elevated: "#27272a",
  border: "#3f3f46",
  borderSub: "#27272a",
  text: "#fafafa",
  textMuted: "#a1a1aa",
  textDim: "#71717a",
  accent: "#6366f1",
  danger: "#ef4444",
  warn: "#f59e0b",
  success: "#22c55e",
};

const TABS = [
  { id: "dashboard", label: "Overview", Icon: Activity },
  { id: "logs", label: "Live logs", Icon: ScrollText },
  { id: "policy", label: "Eval & policy", Icon: SlidersHorizontal },
  { id: "test", label: "Test console", Icon: Terminal },
];

// ── Test Console ───────────────────────────────────────────────────────────────
function TestConsole() {
  const DEFAULT = `My name is Jane Doe, email jane@example.com, SSN 123-45-6789.\nPlease review our Q3 formula: Revenue_Adjusted = (Gross_Revenue * 0.73) - COGS_v2 + RecurringARR`;
  const [input, setInput] = useState(DEFAULT);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });
      setResult(await r.json());
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  const VERDICT_COLOR = {
    BLOCKED: tokens.danger,
    REDACTED: tokens.warn,
    CLEAR: tokens.success,
  };
  const color = result?.verdict
    ? VERDICT_COLOR[result.verdict]
    : tokens.textDim;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Input card */}
      <div
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <Terminal size={14} style={{ color: tokens.textDim }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: tokens.text }}>
            Prompt tester
          </span>
          <span style={{ fontSize: 12, color: tokens.textDim, marginLeft: 4 }}>
            — bypasses upstream forwarding; runs pure pipeline analysis
          </span>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: tokens.elevated,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 13,
            color: tokens.textMuted,
            fontFamily: "'JetBrains Mono', monospace",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
          }}
          onFocus={(e) => (e.target.style.borderColor = tokens.accent)}
          onBlur={(e) => (e.target.style.borderColor = tokens.border)}
          placeholder="Enter any text to analyze…"
        />
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            onClick={run}
            disabled={loading || !input.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 20px",
              borderRadius: 8,
              background: tokens.accent,
              border: "none",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              opacity: loading || !input.trim() ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? (
              <RefreshCw
                size={13}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Shield size={13} />
            )}
            {loading ? "Analyzing…" : "Analyze"}
          </button>
          <button
            onClick={() => setInput(DEFAULT)}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              background: "transparent",
              border: `1px solid ${tokens.border}`,
              color: tokens.textDim,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Result card */}
      {result && !result.error && (
        <div
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 12,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Verdict banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: `${color}12`,
              border: `1px solid ${color}30`,
              borderRadius: 9,
              padding: "12px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  fontFamily: "monospace",
                  color,
                  letterSpacing: "-0.02em",
                }}
              >
                {result.verdict}
              </span>
              {result.block_reason && (
                <span style={{ fontSize: 12, color: tokens.textMuted }}>
                  {result.block_reason}
                </span>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: 16,
                fontSize: 11,
                fontFamily: "monospace",
              }}
            >
              <span style={{ color: tokens.textDim }}>
                ID{" "}
                <span style={{ color: tokens.accent }}>
                  {result.request_id}
                </span>
              </span>
              <span style={{ color: tokens.textDim }}>
                {result.latency_ms}ms
              </span>
              {result.cache_hit && (
                <span style={{ color: tokens.purple ?? "#a855f7" }}>
                  CACHED
                </span>
              )}
            </div>
          </div>

          {/* Diagnostic headers */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: tokens.textDim,
                marginBottom: 8,
              }}
            >
              Response headers
            </div>
            <pre
              style={{
                background: tokens.elevated,
                border: `1px solid ${tokens.borderSub}`,
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 11,
                color: tokens.success,
                fontFamily: "monospace",
                lineHeight: 1.8,
                overflow: "auto",
                margin: 0,
              }}
            >
              {`X-AegisAI-Verdict:          ${result.verdict}
X-AegisAI-RequestID:        ${result.request_id}
X-AegisAI-Latency:          ${result.latency_ms}ms
X-AegisAI-PII-Count:        ${(result.ner_detections || []).length}
X-AegisAI-IP-Score:         ${(result.ip_similarity_score || 0).toFixed(3)}
X-AegisAI-Injection-Score:  ${(result.injection_score || 0).toFixed(3)}
X-AegisAI-Cache-Hit:        ${result.cache_hit}`}
            </pre>
          </div>

          {/* Sanitized */}
          {result.sanitized_text && result.sanitized_text !== input && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: tokens.warn,
                  marginBottom: 8,
                }}
              >
                Sanitized — {(result.ner_detections || []).length} PII
                redactions
              </div>
              <pre
                style={{
                  background: "#1c1400",
                  border: "1px solid #78350f50",
                  borderRadius: 8,
                  padding: "12px 14px",
                  fontSize: 11,
                  color: "#fcd34d",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {result.sanitized_text}
              </pre>
            </div>
          )}

          {/* Stage grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
            }}
          >
            {[
              ["NER", result.stage_latencies?.ner_ms, tokens.warn, "ms"],
              ["Embed", result.stage_latencies?.embed_ms, tokens.accent, "ms"],
              [
                "Rev-RAG",
                result.stage_latencies?.reverse_rag_ms,
                tokens.purple ?? "#a855f7",
                "ms",
              ],
              [
                "Injection",
                result.stage_latencies?.injection_ms,
                tokens.danger,
                "ms",
              ],
              [
                "IP score",
                (result.ip_similarity_score || 0).toFixed(4),
                result.ip_similarity_score >= 0.82
                  ? tokens.danger
                  : tokens.success,
                "",
              ],
              [
                "Inject score",
                (result.injection_score || 0).toFixed(4),
                result.injection_score >= 0.75 ? tokens.danger : tokens.success,
                "",
              ],
            ]
              .slice(0, 4)
              .map(([lbl, val, col, unit]) => (
                <div
                  key={lbl}
                  style={{
                    background: tokens.elevated,
                    border: `1px solid ${tokens.borderSub}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: tokens.textDim,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                    }}
                  >
                    {lbl}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: col,
                      marginTop: 4,
                    }}
                  >
                    {val ?? "—"}
                    {typeof val === "number" ? unit : ""}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {result?.error && (
        <div
          style={{
            background: "#450a0a",
            border: `1px solid ${tokens.danger}30`,
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 12,
            color: "#fca5a5",
          }}
        >
          Error: {result.error}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [logs, setLogs] = useState([]);
  const [health, setHealth] = useState(null);

  // Deduplicated setter — merges by request_id so WS reconnects
  // and tab switches never produce duplicate rows in the log table.
  const setLogsDedup = React.useCallback((incoming) => {
    setLogs((prev) => {
      const next = typeof incoming === "function" ? incoming(prev) : incoming;
      const seenIds = new Set(prev.map((l) => l.request_id).filter(Boolean));
      const fresh = Array.isArray(next)
        ? next.filter((l) => !l.request_id || !seenIds.has(l.request_id))
        : [];
      return [...fresh, ...prev].slice(0, 500);
    });
  }, []);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "offline" }));
    // Initial seed: set directly (no dedup needed, starting from empty)
    fetch(`${API}/logs?limit=200`)
      .then((r) => r.json())
      .then(setLogs)
      .catch(() => {});
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: tokens.bg,
        color: tokens.text,
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav
        style={{
          borderBottom: `1px solid ${tokens.borderSub}`,
          background: tokens.bg,
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 52,
            display: "flex",
            alignItems: "center",
            gap: 0,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              marginRight: 32,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: tokens.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={14} color="#fff" />
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: tokens.text,
                letterSpacing: "-0.02em",
              }}
            >
              AegisAI
            </span>
            <span
              style={{
                fontSize: 10,
                color: tokens.textDim,
                background: tokens.elevated,
                border: `1px solid ${tokens.border}`,
                borderRadius: 4,
                padding: "2px 6px",
                fontFamily: "monospace",
              }}
            >
              v1.0
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, flex: 1 }}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 14px",
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                  background: tab === id ? tokens.elevated : "transparent",
                  color: tab === id ? tokens.text : tokens.textDim,
                  transition: "all 0.12s",
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background:
                  health?.status === "ok" ? tokens.success : tokens.danger,
                animation:
                  health?.status === "ok"
                    ? "pulse 2.5s ease-in-out infinite"
                    : "none",
              }}
            />
            <span style={{ fontSize: 11, color: tokens.textDim }}>
              {health?.status === "ok"
                ? `${health.vector_db_count ?? 0} assets indexed`
                : "Offline"}
            </span>
          </div>
        </div>
      </nav>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        {tab === "dashboard" && <Dashboard logs={logs} />}
        {tab === "logs" && <LogViewer logs={logs} setLogs={setLogsDedup} />}
        {tab === "policy" && <PolicyConfig />}
        {tab === "test" && <TestConsole />}
      </main>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${tokens.bg}; }
        ::-webkit-scrollbar-thumb { background: ${tokens.border}; border-radius: 3px; }
      `}</style>
    </div>
  );
}
