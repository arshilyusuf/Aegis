import React, { useState, useEffect } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  SlidersHorizontal,
  FlaskConical,
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
  purple: "#a855f7",
};

// ── Shared primitives ──────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 12,
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: tokens.textDim,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{ borderTop: `1px solid ${tokens.borderSub}`, margin: "20px 0" }}
    />
  );
}

// ── Radial Gauge ───────────────────────────────────────────────────────────────
function Gauge({ label, value, color, sub }) {
  const r = 36,
    circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, value)));
  const pct = Math.round(value * 100);

  return (
    <div
      style={{
        background: tokens.elevated,
        border: `1px solid ${tokens.borderSub}`,
        borderRadius: 10,
        padding: "20px 16px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={88} height={88} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={44}
            cy={44}
            r={r}
            fill="none"
            stroke={tokens.borderSub}
            strokeWidth={6}
          />
          <circle
            cx={44}
            cy={44}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)",
            }}
          />
        </svg>
        <span
          style={{
            position: "absolute",
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "monospace",
            color,
            letterSpacing: "-0.02em",
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          fontWeight: 600,
          color: tokens.text,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 3, fontSize: 11, color: tokens.textDim }}>
        {sub}
      </div>
    </div>
  );
}

// ── Sample row ─────────────────────────────────────────────────────────────────
const OUTCOME_CFG = {
  TP: { color: tokens.success, Icon: CheckCircle2, label: "True positive" },
  TN: { color: tokens.success, Icon: CheckCircle2, label: "True negative" },
  FP: { color: tokens.warn, Icon: AlertCircle, label: "False positive" },
  FN: { color: tokens.danger, Icon: XCircle, label: "False negative" },
};

function SampleRow({ sample }) {
  const cfg = OUTCOME_CFG[sample.outcome] || OUTCOME_CFG.TN;
  return (
    <tr style={{ borderBottom: `1px solid ${tokens.borderSub}` }}>
      <td
        style={{
          padding: "8px 14px",
          fontSize: 11,
          fontFamily: "monospace",
          color: tokens.textMuted,
          maxWidth: 280,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {sample.text_preview}
      </td>
      <td
        style={{
          padding: "8px 14px",
          fontSize: 11,
          fontFamily: "monospace",
          color: tokens.textDim,
        }}
      >
        {sample.expected}
      </td>
      <td
        style={{
          padding: "8px 14px",
          fontSize: 11,
          fontFamily: "monospace",
          color: tokens.text,
        }}
      >
        {sample.actual}
      </td>
      <td style={{ padding: "8px 14px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 500,
            color: cfg.color,
          }}
        >
          <cfg.Icon size={12} />
          {cfg.label}
        </span>
      </td>
      <td
        style={{
          padding: "8px 14px",
          fontSize: 11,
          color: tokens.textDim,
          fontStyle: "italic",
        }}
      >
        {sample.block_reason
          ? sample.block_reason.slice(0, 60) +
            (sample.block_reason.length > 60 ? "…" : "")
          : "—"}
      </td>
    </tr>
  );
}

// ── Threshold Slider ───────────────────────────────────────────────────────────
function ThresholdSlider({ label, description, value, onChange, color }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 500, color: tokens.text }}>
          {label}
        </label>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "monospace",
            color,
            letterSpacing: "-0.02em",
          }}
        >
          {value.toFixed(2)}
        </span>
      </div>
      <p
        style={{
          fontSize: 12,
          color: tokens.textDim,
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {/* Track + fill */}
      <div
        style={{
          position: "relative",
          height: 4,
          background: tokens.elevated,
          borderRadius: 2,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            borderRadius: 2,
            width: `${((value - 0.5) / 0.49) * 100}%`,
            background: color,
            transition: "width 0.15s",
          }}
        />
        <input
          type="range"
          min={0.5}
          max={0.99}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            opacity: 0,
            cursor: "pointer",
            height: 20,
            top: -8,
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 10,
            color: tokens.textDim,
            fontFamily: "monospace",
          }}
        >
          0.50 strict
        </span>
        <span
          style={{
            fontSize: 10,
            color: tokens.textDim,
            fontFamily: "monospace",
          }}
        >
          0.99 lenient
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PolicyConfig() {
  const [localPolicy, setLocalPolicy] = useState({
    similarity_threshold: 0.82,
    injection_threshold: 0.75,
  });
  const [evalResults, setEvalResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    fetch(`${API}/policy`)
      .then((r) => r.json())
      .then((d) => setLocalPolicy(d))
      .catch(() => {});
  }, []);

  const handleRunEval = async () => {
    setRunning(true);
    setEvalResults(null);
    try {
      const r = await fetch(`${API}/evaluate`, { method: "POST" });
      setEvalResults(await r.json());
    } catch {
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          similarity_threshold: localPolicy.similarity_threshold,
          injection_threshold: localPolicy.injection_threshold,
        }),
      });
      setSaveMsg("Applied");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch {
      setSaveMsg("Failed");
    } finally {
      setSaving(false);
    }
  };

  const radarData = evalResults
    ? [
        { metric: "Precision", value: Math.round(evalResults.precision * 100) },
        { metric: "Recall", value: Math.round(evalResults.recall * 100) },
        { metric: "F2", value: Math.round(evalResults.f2_score * 100) },
        { metric: "Accuracy", value: Math.round(evalResults.accuracy * 100) },
      ]
    : [];

  const cmData = evalResults
    ? [
        {
          label: "TP",
          value: evalResults.true_positives,
          fill: tokens.success,
        },
        {
          label: "TN",
          value: evalResults.true_negatives,
          fill: tokens.success,
        },
        { label: "FP", value: evalResults.false_positives, fill: tokens.warn },
        {
          label: "FN",
          value: evalResults.false_negatives,
          fill: tokens.danger,
        },
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Detection Thresholds ─────────────────────────────────────────────── */}
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <SlidersHorizontal size={15} style={{ color: tokens.textDim }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: tokens.text }}>
            Detection thresholds
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: tokens.textDim,
              background: tokens.elevated,
              border: `1px solid ${tokens.borderSub}`,
              borderRadius: 5,
              padding: "3px 8px",
            }}
          >
            Hot reload — no restart needed
          </span>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}
        >
          <ThresholdSlider
            label="IP similarity cutoff"
            description="Block when a prompt's cosine similarity to any indexed corporate asset reaches this value. Lower is stricter."
            value={localPolicy.similarity_threshold || 0.82}
            onChange={(v) =>
              setLocalPolicy((p) => ({ ...p, similarity_threshold: v }))
            }
            color={tokens.danger}
          />
          <ThresholdSlider
            label="Injection classifier cutoff"
            description="Block when the jailbreak classifier scores a prompt at or above this value. Lower is stricter."
            value={localPolicy.injection_threshold || 0.75}
            onChange={(v) =>
              setLocalPolicy((p) => ({ ...p, injection_threshold: v }))
            }
            color={tokens.warn}
          />
        </div>

        <Divider />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              borderRadius: 8,
              background: tokens.accent,
              border: "none",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {saving ? "Applying…" : "Apply policy"}
          </button>
          {saveMsg && (
            <span
              style={{
                fontSize: 12,
                color: saveMsg === "Applied" ? tokens.success : tokens.danger,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {saveMsg === "Applied" ? (
                <CheckCircle2 size={13} />
              ) : (
                <XCircle size={13} />
              )}
              {saveMsg}
            </span>
          )}
        </div>
      </Card>

      {/* ── Evaluation Suite ─────────────────────────────────────────────────── */}
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <FlaskConical
            size={15}
            style={{ color: tokens.purple, marginTop: 1 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: tokens.text }}>
              Evaluation suite
            </div>
            <div
              style={{
                fontSize: 12,
                color: tokens.textDim,
                marginTop: 4,
                lineHeight: 1.6,
              }}
            >
              Runs 15 labelled fixtures — PII, injection attempts, IP
              exfiltration, and clean prompts — through the live pipeline.
              Reports{" "}
              <strong style={{ color: tokens.textMuted }}>
                Precision, Recall, and F2-Score
              </strong>{" "}
              (β=2 weights recall 4× heavier).
            </div>
          </div>
          <button
            onClick={handleRunEval}
            disabled={running}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              borderRadius: 8,
              flexShrink: 0,
              background: running ? tokens.elevated : tokens.purple,
              border: `1px solid ${running ? tokens.border : tokens.purple}`,
              color: running ? tokens.textDim : "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: running ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            <Play
              size={13}
              style={running ? { animation: "spin 1s linear infinite" } : {}}
            />
            {running ? "Running…" : "Run evaluation"}
          </button>
        </div>

        {running && (
          <div
            style={{
              background: tokens.elevated,
              border: `1px solid ${tokens.borderSub}`,
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 12,
              color: tokens.textDim,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: tokens.purple,
                animation: "pulse 1.2s ease-in-out infinite",
              }}
            />
            Routing 15 test vectors through NER → Reverse-RAG → injection
            classifier…
          </div>
        )}

        {evalResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Gauges */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
              }}
            >
              <Gauge
                label="Precision"
                value={evalResults.precision}
                color={tokens.accent}
                sub="Flagged = real threat"
              />
              <Gauge
                label="Recall"
                value={evalResults.recall}
                color={tokens.success}
                sub="Threats caught (≥95%)"
              />
              <Gauge
                label="F2-Score"
                value={evalResults.f2_score}
                color={tokens.purple}
                sub="Recall-weighted"
              />
              <Gauge
                label="Accuracy"
                value={evalResults.accuracy}
                color={tokens.warn}
                sub="Overall correctness"
              />
            </div>

            {/* Status line */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background:
                  evalResults.false_negatives === 0 ? "#052e16" : "#450a0a",
                border: `1px solid ${evalResults.false_negatives === 0 ? tokens.success + "30" : tokens.danger + "30"}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color:
                  evalResults.false_negatives === 0 ? "#86efac" : "#fca5a5",
              }}
            >
              {evalResults.false_negatives === 0 ? (
                <>
                  <CheckCircle2 size={13} /> Zero false negatives — all threats
                  intercepted.
                </>
              ) : (
                <>
                  <XCircle size={13} /> {evalResults.false_negatives} false
                  negative(s) — threats leaked. Lower the thresholds.
                </>
              )}
              <span style={{ marginLeft: "auto", color: tokens.textDim }}>
                {evalResults.sample_count} samples ·{" "}
                {evalResults.eval_latency_ms}ms
              </span>
            </div>

            {/* Charts */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: tokens.elevated,
                  border: `1px solid ${tokens.borderSub}`,
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <SectionLabel>Metric radar</SectionLabel>
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData} outerRadius={60}>
                    <PolarGrid stroke={tokens.borderSub} />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: tokens.textDim, fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      dataKey="value"
                      stroke={tokens.purple}
                      fill={tokens.purple}
                      fillOpacity={0.2}
                      strokeWidth={1.5}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div
                style={{
                  background: tokens.elevated,
                  border: `1px solid ${tokens.borderSub}`,
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <SectionLabel>Confusion matrix</SectionLabel>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={cmData}
                    barSize={32}
                    margin={{ top: 8, right: 0, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke={tokens.borderSub}
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: tokens.textDim, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: tokens.textDim, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: tokens.bg,
                        border: `1px solid ${tokens.border}`,
                        borderRadius: 7,
                        fontSize: 12,
                        color: tokens.textMuted,
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {cmData.map((d, i) => (
                        <Cell key={i} fill={d.fill} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-sample table */}
            <div>
              <SectionLabel>Per-sample results</SectionLabel>
              <div
                style={{
                  background: tokens.elevated,
                  border: `1px solid ${tokens.borderSub}`,
                  borderRadius: 10,
                  overflow: "hidden",
                  marginTop: 8,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{ borderBottom: `1px solid ${tokens.borderSub}` }}
                    >
                      {["Input", "Expected", "Actual", "Outcome", "Reason"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              padding: "9px 14px",
                              textAlign: "left",
                              fontSize: 10,
                              fontWeight: 500,
                              letterSpacing: "0.07em",
                              textTransform: "uppercase",
                              color: tokens.textDim,
                            }}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(evalResults.per_sample || []).map((s, i) => (
                      <SampleRow key={i} sample={s} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Card>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
