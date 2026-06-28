import React, { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  ShieldOff,
  ShieldCheck,
  Timer,
  Zap,
  Database,
  CheckCircle,
  Activity,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const VERDICT_COLORS = {
  CLEAR: "#22c55e",
  REDACTED: "#f59e0b",
  BLOCKED: "#ef4444",
};

// ── Design tokens ──────────────────────────────────────────────────────────────
const tokens = {
  bg: "#09090b", // zinc-950
  surface: "#18181b", // zinc-900
  elevated: "#27272a", // zinc-800
  border: "#3f3f46", // zinc-700
  borderSub: "#27272a", // zinc-800
  text: "#fafafa", // zinc-50
  textMuted: "#a1a1aa", // zinc-400
  textDim: "#71717a", // zinc-500
  accent: "#6366f1", // indigo-500
  danger: "#ef4444",
  warn: "#f59e0b",
  success: "#22c55e",
};

// ── Primitives ─────────────────────────────────────────────────────────────────
function Card({ children, className = "" }) {
  return (
    <div
      className={className}
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 12,
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: tokens.textDim,
      }}
    >
      {children}
    </span>
  );
}

function Divider() {
  return (
    <div
      style={{ borderTop: `1px solid ${tokens.borderSub}`, margin: "16px 0" }}
    />
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, delta, accent = tokens.accent }) {
  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <Label>{label}</Label>
        <div
          style={{
            background: tokens.elevated,
            borderRadius: 8,
            padding: "6px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={14} style={{ color: tokens.textDim }} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: tokens.text,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "-0.03em",
          }}
        >
          {value}
        </span>
      </div>
      {delta && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 12, color: tokens.textDim }}>{delta}</span>
        </div>
      )}
    </Card>
  );
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: tokens.elevated,
        border: `1px solid ${tokens.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: tokens.textMuted,
      }}
    >
      {formatter
        ? formatter(payload[0].value, payload[0])
        : `${payload[0].value}ms`}
    </div>
  );
}

// ── Verdict Badge ──────────────────────────────────────────────────────────────
function VerdictDot({ verdict, count, total }) {
  const color = VERDICT_COLORS[verdict] || tokens.textDim;
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: tokens.textMuted, flex: 1 }}>
        {verdict}
      </span>
      <span
        style={{ fontSize: 12, color: tokens.text, fontFamily: "monospace" }}
      >
        {count}
      </span>
      <span
        style={{
          fontSize: 11,
          color: tokens.textDim,
          width: 44,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Dashboard({ logs }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const r = await fetch(`${API}/stats`);
      setStats(await r.json());
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => clearInterval(id);
  }, []);

  const series = [...logs]
    .reverse()
    .slice(-24)
    .map((l, i) => ({
      i,
      latency: Math.round(l.total_latency_ms || 0),
      verdict: l.verdict,
    }));

  const barData = series.map((d) => ({
    ...d,
    fill: VERDICT_COLORS[d.verdict] || tokens.textDim,
  }));

  const total = stats?.total || 0;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: tokens.textDim,
          padding: 40,
        }}
      >
        <Activity size={16} />
        <span style={{ fontSize: 13 }}>Loading metrics…</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── KPI row ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
      >
        <StatCard
          icon={TrendingUp}
          label="Total requests"
          value={total || "—"}
          delta="Since startup"
        />
        <StatCard
          icon={ShieldOff}
          label="Blocked"
          value={stats?.blocked ?? "—"}
          delta={
            stats ? `${(stats.block_rate * 100).toFixed(1)}% of traffic` : ""
          }
        />
        <StatCard
          icon={ShieldCheck}
          label="Redacted"
          value={stats?.redacted ?? "—"}
          delta={
            stats ? `${(stats.redact_rate * 100).toFixed(1)}% of traffic` : ""
          }
        />
        <StatCard
          icon={Timer}
          label="Avg latency"
          value={stats ? `${stats.avg_latency_ms}ms` : "—"}
          delta="Pipeline overhead"
        />
        <StatCard
          icon={Zap}
          label="Cache hit rate"
          value={stats ? `${(stats.cache_hit_rate * 100).toFixed(1)}%` : "—"}
          delta={`${stats?.cache_hits ?? 0} hits`}
        />
        <StatCard
          icon={Database}
          label="Indexed assets"
          value={stats?.vector_db_count ?? "—"}
          delta="Vector fingerprints"
        />
        <StatCard
          icon={CheckCircle}
          label="Forwarded"
          value={stats?.clear ?? "—"}
          delta="Reached upstream"
        />
        <StatCard
          icon={Activity}
          label="Redis ops"
          value={stats?.redis_stats?.total_commands ?? "—"}
          delta={`H:${stats?.redis_stats?.hits ?? 0} M:${stats?.redis_stats?.misses ?? 0}`}
        />
      </div>

      {/* ── Charts row ───────────────────────────────────────────────────────── */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}
      >
        {/* Latency sparkline */}
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Label>Pipeline latency — last 24 requests</Label>
            <div
              style={{
                fontSize: 11,
                color: tokens.textDim,
                background: tokens.elevated,
                borderRadius: 6,
                padding: "3px 8px",
                border: `1px solid ${tokens.border}`,
              }}
            >
              SLA &lt;150ms
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={series}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={tokens.accent}
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="100%"
                    stopColor={tokens.accent}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke={tokens.borderSub}
                strokeDasharray="4 4"
                vertical={false}
              />
              <XAxis dataKey="i" hide />
              <YAxis
                tick={{ fill: tokens.textDim, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="latency"
                stroke={tokens.accent}
                strokeWidth={1.5}
                fill="url(#areaFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Verdict breakdown */}
        <Card>
          <Label>Verdict split</Label>
          <Divider />
          {total > 0 ? (
            <>
              {/* Mini donut */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "CLEAR", value: stats?.clear || 0 },
                        { name: "REDACTED", value: stats?.redacted || 0 },
                        { name: "BLOCKED", value: stats?.blocked || 0 },
                      ].filter((d) => d.value > 0)}
                      innerRadius={34}
                      outerRadius={52}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {["CLEAR", "REDACTED", "BLOCKED"].map((v) => (
                        <Cell key={v} fill={VERDICT_COLORS[v]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <VerdictDot
                  verdict="CLEAR"
                  count={stats?.clear || 0}
                  total={total}
                />
                <VerdictDot
                  verdict="REDACTED"
                  count={stats?.redacted || 0}
                  total={total}
                />
                <VerdictDot
                  verdict="BLOCKED"
                  count={stats?.blocked || 0}
                  total={total}
                />
              </div>
            </>
          ) : (
            <div
              style={{
                color: tokens.textDim,
                fontSize: 13,
                textAlign: "center",
                padding: "32px 0",
              }}
            >
              No requests yet
            </div>
          )}
        </Card>
      </div>

      {/* ── Per-request latency bars ─────────────────────────────────────────── */}
      {barData.length > 0 && (
        <Card>
          <Label>Per-request latency — colored by verdict</Label>
          <div style={{ marginTop: 16 }}>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart
                data={barData}
                barSize={10}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={tokens.borderSub}
                  strokeDasharray="4 4"
                  vertical={false}
                />
                <XAxis dataKey="i" hide />
                <YAxis
                  tick={{ fill: tokens.textDim, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div
                        style={{
                          background: tokens.elevated,
                          border: `1px solid ${tokens.border}`,
                          borderRadius: 6,
                          padding: "6px 10px",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: VERDICT_COLORS[d.verdict] }}>
                          {d.verdict}
                        </span>
                        <span style={{ color: tokens.textDim, marginLeft: 8 }}>
                          {d.latency}ms
                        </span>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="latency" radius={[2, 2, 0, 0]}>
                  {barData.map((d, i) => (
                    <Cell key={i} fill={d.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
