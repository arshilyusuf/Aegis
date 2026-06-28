import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
  Eye,
  X,
  Circle,
} from "lucide-react";

const WS_URL = import.meta.env.REACT_APP_WS_URL || "ws://localhost:8000";

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

const VERDICT = {
  BLOCKED: {
    color: tokens.danger,
    bg: "#450a0a",
    Icon: ShieldOff,
    label: "BLOCKED",
  },
  REDACTED: {
    color: tokens.warn,
    bg: "#431407",
    Icon: AlertTriangle,
    label: "REDACTED",
  },
  CLEAR: {
    color: tokens.success,
    bg: "#052e16",
    Icon: ShieldCheck,
    label: "CLEAR",
  },
};

// ── Primitives ─────────────────────────────────────────────────────────────────
function Badge({ verdict }) {
  const cfg = VERDICT[verdict] || VERDICT.CLEAR;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.07em",
        fontFamily: "monospace",
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}30`,
      }}
    >
      <cfg.Icon size={10} />
      {cfg.label}
    </span>
  );
}

function EntityTag({ type }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "monospace",
        fontWeight: 500,
        color: tokens.warn,
        background: "#1c1400",
        border: `1px solid #78350f50`,
        borderRadius: 4,
        padding: "1px 6px",
      }}
    >
      {type}
    </span>
  );
}

function FilterTab({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        border: active ? `1px solid ${tokens.border}` : "1px solid transparent",
        background: active ? tokens.elevated : "transparent",
        color: active ? tokens.text : tokens.textDim,
        transition: "all 0.15s",
      }}
    >
      {label}
      {count !== undefined && (
        <span
          style={{
            fontSize: 10,
            fontFamily: "monospace",
            color: active ? tokens.textMuted : tokens.textDim,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function Drawer({ entry, onClose }) {
  if (!entry) return null;
  const cfg = VERDICT[entry.verdict] || VERDICT.CLEAR;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 40,
          backdropFilter: "blur(2px)",
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          background: tokens.surface,
          borderLeft: `1px solid ${tokens.border}`,
          zIndex: 50,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${tokens.borderSub}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "sticky",
            top: 0,
            background: tokens.surface,
            zIndex: 1,
          }}
        >
          <Badge verdict={entry.verdict} />
          <code style={{ fontSize: 11, color: tokens.textDim, flex: 1 }}>
            {entry.request_id}
          </code>
          <span
            style={{
              fontSize: 11,
              color: tokens.textDim,
              fontFamily: "monospace",
            }}
          >
            {(entry.total_latency_ms || 0).toFixed(1)}ms
          </span>
          <button
            onClick={onClose}
            style={{
              background: tokens.elevated,
              border: `1px solid ${tokens.border}`,
              color: tokens.textMuted,
              borderRadius: 6,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={13} />
          </button>
        </div>

        <div
          style={{
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Block reason */}
          {entry.block_reason && (
            <div
              style={{
                background: "#450a0a",
                border: `1px solid ${tokens.danger}30`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: "#fca5a5",
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontWeight: 600, marginRight: 6 }}>Blocked:</span>
              {entry.block_reason}
            </div>
          )}

          {/* Scores row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            {[
              [
                "IP Score",
                (entry.ip_similarity_score || 0).toFixed(4),
                entry.ip_similarity_score >= 0.82,
              ],
              [
                "Inject Score",
                (entry.injection_score || 0).toFixed(4),
                entry.injection_score >= 0.75,
              ],
              [
                "Latency",
                `${(entry.total_latency_ms || 0).toFixed(1)}ms`,
                false,
              ],
            ].map(([lbl, val, warn]) => (
              <div
                key={lbl}
                style={{
                  background: tokens.elevated,
                  borderRadius: 8,
                  padding: "10px 12px",
                  border: `1px solid ${warn ? tokens.danger + "40" : tokens.borderSub}`,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: tokens.textDim,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                  }}
                >
                  {lbl}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    marginTop: 4,
                    color: warn ? tokens.danger : tokens.text,
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* Stage latencies */}
          {entry.stage_latencies &&
            Object.keys(entry.stage_latencies).length > 0 && (
              <div>
                <SectionLabel>Stage latencies</SectionLabel>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    marginTop: 8,
                  }}
                >
                  {Object.entries(entry.stage_latencies).map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        background: tokens.elevated,
                        borderRadius: 6,
                        padding: "7px 12px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: tokens.textMuted,
                        }}
                      >
                        {k}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: tokens.accent,
                        }}
                      >
                        {typeof v === "number" ? `${v}ms` : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Original */}
          <div>
            <SectionLabel>Original prompt</SectionLabel>
            <pre
              style={{
                background: tokens.elevated,
                border: `1px solid ${tokens.borderSub}`,
                borderRadius: 8,
                padding: 12,
                marginTop: 8,
                fontSize: 11,
                color: tokens.textMuted,
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.6,
              }}
            >
              {entry.original_prompt || "—"}
            </pre>
          </div>

          {/* Sanitized */}
          {entry.sanitized_prompt &&
            entry.sanitized_prompt !== entry.original_prompt && (
              <div>
                <SectionLabel style={{ color: tokens.warn }}>
                  Sanitized output
                </SectionLabel>
                <pre
                  style={{
                    background: "#1c1400",
                    border: `1px solid #78350f50`,
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 8,
                    fontSize: 11,
                    color: "#fcd34d",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    lineHeight: 1.6,
                  }}
                >
                  {entry.sanitized_prompt}
                </pre>
              </div>
            )}

          {/* NER detections */}
          {entry.ner_detections?.length > 0 && (
            <div>
              <SectionLabel>
                PII detections — {entry.ner_detections.length}
              </SectionLabel>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 8,
                }}
              >
                {entry.ner_detections.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: tokens.elevated,
                      borderRadius: 6,
                      padding: "7px 12px",
                    }}
                  >
                    <EntityTag type={d.entity_type} />
                    <span style={{ fontSize: 11, color: tokens.textDim }}>
                      {d.layer}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: tokens.textDim,
                        marginLeft: "auto",
                      }}
                    >
                      {d.confidence ? `conf ${d.confidence.toFixed(3)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IP match */}
          {entry.ip_match && (
            <div>
              <SectionLabel>Matched asset</SectionLabel>
              <div
                style={{
                  background: "#450a0a",
                  border: `1px solid ${tokens.danger}30`,
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 8,
                }}
              >
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: "#fca5a5" }}
                >
                  {entry.ip_match.payload?.name}
                </div>
                <div
                  style={{ fontSize: 11, color: tokens.textDim, marginTop: 4 }}
                >
                  {entry.ip_match.payload?.category} ·{" "}
                  {entry.ip_match.payload?.sensitivity}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "#71717a",
                    marginTop: 8,
                    lineHeight: 1.5,
                  }}
                >
                  {entry.ip_match.payload?.content_preview}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children, style = {} }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: tokens.textDim,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LogViewer({ logs, setLogs }) {
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [live, setLive] = useState(true);
  // Stable ref so the WS effect never retriggers due to setLogs identity change
  const setLogsRef = useRef(setLogs);
  useEffect(() => {
    setLogsRef.current = setLogs;
  }, [setLogs]);
  // Track seen request IDs to prevent the backend's on-connect replay
  // from re-inserting entries that are already in state
  const seenIds = useRef(
    new Set(logs.map((l) => l.request_id).filter(Boolean)),
  );

  useEffect(() => {
    if (!live) return;
    const ws = new WebSocket(`${WS_URL.replace(/^http/, "ws")}/ws/logs`);
    ws.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data);
        const id = entry.request_id;
        // Skip if we already have this entry (backend replays last 20 on connect)
        if (id && seenIds.current.has(id)) return;
        if (id) seenIds.current.add(id);
        setLogsRef.current((prev) => [entry, ...prev].slice(0, 500));
      } catch {}
    };
    return () => ws.close();
  }, [live]); // no setLogs in deps — use ref instead

  const filtered =
    filter === "ALL" ? logs : logs.filter((l) => l.verdict === filter);

  const counts = {
    ALL: logs.length,
    BLOCKED: logs.filter((l) => l.verdict === "BLOCKED").length,
    REDACTED: logs.filter((l) => l.verdict === "REDACTED").length,
    CLEAR: logs.filter((l) => l.verdict === "CLEAR").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Drawer entry={expanded} onClose={() => setExpanded(null)} />

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {["ALL", "BLOCKED", "REDACTED", "CLEAR"].map((f) => (
          <FilterTab
            key={f}
            label={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            count={counts[f]}
          />
        ))}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: tokens.textDim }}>
            {filtered.length} entries
          </span>
          <button
            onClick={() => setLive((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              border: `1px solid ${live ? tokens.success + "50" : tokens.border}`,
              background: live ? "#052e16" : tokens.elevated,
              color: live ? tokens.success : tokens.textDim,
            }}
          >
            <Circle
              size={6}
              fill={live ? tokens.success : tokens.textDim}
              stroke="none"
              style={live ? { animation: "pulse 2s infinite" } : {}}
            />
            Live
          </button>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.borderSub}` }}>
                {[
                  "Time",
                  "ID",
                  "Verdict",
                  "Prompt",
                  "Entities",
                  "IP",
                  "Inject",
                  "Latency",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: tokens.textDim,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: "48px 16px",
                      textAlign: "center",
                      fontSize: 13,
                      color: tokens.textDim,
                    }}
                  >
                    No entries — send a prompt to{" "}
                    <code style={{ color: tokens.textMuted }}>
                      /v1/chat/completions
                    </code>
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 100).map((entry, i) => {
                  const ts = entry.timestamp
                    ? new Date(entry.timestamp * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "—";
                  const isHigh = entry.ip_similarity_score >= 0.82;
                  const isInj = entry.injection_score >= 0.75;

                  return (
                    <tr
                      key={i}
                      onClick={() => setExpanded(entry)}
                      style={{
                        borderBottom: `1px solid ${tokens.borderSub}`,
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = tokens.elevated)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td
                        style={{
                          padding: "10px 16px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: tokens.textDim,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ts}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: tokens.textDim,
                        }}
                      >
                        {entry.request_id || "—"}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <Badge verdict={entry.verdict} />
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          fontSize: 12,
                          color: tokens.textMuted,
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontFamily: "monospace",
                        }}
                      >
                        {entry.original_prompt || entry.sanitized_prompt || "—"}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <div
                          style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                        >
                          {(entry.ner_detections || [])
                            .slice(0, 2)
                            .map((d, j) => (
                              <EntityTag key={j} type={d.entity_type} />
                            ))}
                          {(entry.ner_detections || []).length > 2 && (
                            <span
                              style={{ fontSize: 10, color: tokens.textDim }}
                            >
                              +{entry.ner_detections.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: isHigh ? tokens.danger : tokens.textDim,
                        }}
                      >
                        {(entry.ip_similarity_score || 0).toFixed(3)}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: isInj ? tokens.danger : tokens.textDim,
                        }}
                      >
                        {(entry.injection_score || 0).toFixed(3)}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: tokens.accent,
                        }}
                      >
                        {(entry.total_latency_ms || 0).toFixed(0)}ms
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                        <Eye size={13} style={{ color: tokens.textDim }} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
