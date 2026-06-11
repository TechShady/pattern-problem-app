import React, { useMemo, useState } from "react";
import { Text, Heading } from "@dynatrace/strato-components/typography";

// ─── Forecast Algorithms ───

function linearRegression(data: number[]): { forecast: number[]; confidence: number[] } {
  const n = data.length;
  const forecastLen = Math.max(Math.round(n * 0.4), 6);
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += data[i]; sumXY += i * data[i]; sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (data[i] - (intercept + slope * i)) ** 2;
  const std = Math.sqrt(sse / n);
  const forecast: number[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < forecastLen; i++) {
    forecast.push(intercept + slope * (n + i));
    confidence.push(std * (1 + 0.1 * i));
  }
  return { forecast, confidence };
}

function holtWinters(data: number[]): { forecast: number[]; confidence: number[] } {
  const n = data.length;
  const forecastLen = Math.max(Math.round(n * 0.4), 6);
  const alpha = 0.3, beta = 0.1;
  let level = data[0], trend = (data[Math.min(3, n - 1)] - data[0]) / Math.min(3, n - 1);
  for (let i = 1; i < n; i++) {
    const newLevel = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
  }
  let sse = 0;
  let l2 = data[0], t2 = trend;
  for (let i = 1; i < n; i++) {
    const pred = l2 + t2;
    sse += (data[i] - pred) ** 2;
    const nl = alpha * data[i] + (1 - alpha) * (l2 + t2);
    t2 = beta * (nl - l2) + (1 - beta) * t2;
    l2 = nl;
  }
  const std = Math.sqrt(sse / n);
  const forecast: number[] = [];
  const confidence: number[] = [];
  for (let i = 1; i <= forecastLen; i++) {
    forecast.push(level + trend * i);
    confidence.push(std * (1 + 0.12 * i));
  }
  return { forecast, confidence };
}

function tripleExponential(data: number[]): { forecast: number[]; confidence: number[] } {
  const n = data.length;
  const forecastLen = Math.max(Math.round(n * 0.4), 6);
  const m = Math.min(Math.max(Math.round(n / 4), 3), 12); // season length
  const alpha = 0.3, beta = 0.1, gamma = 0.2;
  // Initialize
  const seasonal: number[] = new Array(m).fill(0);
  const avg = data.slice(0, m).reduce((a, b) => a + b, 0) / m;
  for (let i = 0; i < m; i++) seasonal[i] = data[i] - avg;
  let level = avg, trend = (data[m] !== undefined ? data[m] - data[0] : 0) / m;
  for (let i = m; i < n; i++) {
    const si = i % m;
    const newLevel = alpha * (data[i] - seasonal[si]) + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    seasonal[si] = gamma * (data[i] - newLevel) + (1 - gamma) * seasonal[si];
    level = newLevel;
    trend = newTrend;
  }
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = level + trend * (i - n + 1) + seasonal[i % m];
    sse += (data[i] - pred) ** 2;
  }
  const std = Math.sqrt(sse / n);
  const forecast: number[] = [];
  const confidence: number[] = [];
  for (let i = 1; i <= forecastLen; i++) {
    forecast.push(level + trend * i + seasonal[(n + i - 1) % m]);
    confidence.push(std * (1 + 0.1 * i));
  }
  return { forecast, confidence };
}

function movingAverage(data: number[]): { forecast: number[]; confidence: number[] } {
  const n = data.length;
  const forecastLen = Math.max(Math.round(n * 0.4), 6);
  const window = Math.min(Math.max(Math.round(n / 4), 3), 8);
  const lastWindow = data.slice(-window);
  const avg = lastWindow.reduce((a, b) => a + b, 0) / window;
  let sse = 0;
  for (let i = window; i < n; i++) {
    const ma = data.slice(i - window, i).reduce((a, b) => a + b, 0) / window;
    sse += (data[i] - ma) ** 2;
  }
  const std = Math.sqrt(sse / Math.max(n - window, 1));
  const forecast: number[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < forecastLen; i++) {
    forecast.push(avg);
    confidence.push(std * (1 + 0.08 * i));
  }
  return { forecast, confidence };
}

const METHODS: Record<string, { label: string; fn: (d: number[]) => { forecast: number[]; confidence: number[] } }> = {
  linear: { label: "Linear Regression", fn: linearRegression },
  holt: { label: "Holt-Winters", fn: holtWinters },
  triple: { label: "Triple Exponential", fn: tripleExponential },
  ma: { label: "Moving Average", fn: movingAverage },
};

// ─── Correlated Metrics Helper ───

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i]; sumAB += a[i] * b[i];
    sumA2 += a[i] ** 2; sumB2 += b[i] ** 2;
  }
  const denom = Math.sqrt((n * sumA2 - sumA ** 2) * (n * sumB2 - sumB ** 2));
  if (denom === 0) return 0;
  return (n * sumAB - sumA * sumB) / denom;
}

// ─── Main Modal ───

export interface ForecastModalProps {
  label: string;
  sparkline: number[];
  color?: string;
  onClose: () => void;
  correlatedMetrics?: { label: string; data: number[] }[];
}

export function ForecastModal({ label, sparkline, color = "#4589FF", onClose, correlatedMetrics }: ForecastModalProps) {
  const [method, setMethod] = useState("holt");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { forecast, confidence } = useMemo(() => METHODS[method].fn(sparkline), [sparkline, method]);

  const allData = [...sparkline, ...forecast];
  const min = Math.min(...allData.map((v, i) => v - (i >= sparkline.length ? confidence[i - sparkline.length] : 0)));
  const max = Math.max(...allData.map((v, i) => v + (i >= sparkline.length ? confidence[i - sparkline.length] : 0)));
  const range = max - min || 1;

  const W = 900, H = 350, padL = 60, padR = 20, padT = 20, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (i: number) => padL + (i / (allData.length - 1)) * plotW;
  const toY = (v: number) => padT + plotH - ((v - min) / range) * plotH;

  // Historical line
  const histPts = sparkline.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  // Forecast line
  const fcPts = [sparkline.length - 1, ...Array.from({ length: forecast.length }, (_, i) => sparkline.length + i)]
    .map(i => `${toX(i).toFixed(1)},${toY(allData[i]).toFixed(1)}`).join(" ");
  // Confidence band
  const bandUpper = forecast.map((v, i) => `${toX(sparkline.length + i).toFixed(1)},${toY(v + confidence[i]).toFixed(1)}`);
  const bandLower = forecast.map((v, i) => `${toX(sparkline.length + i).toFixed(1)},${toY(v - confidence[i]).toFixed(1)}`).reverse();
  const bandPoly = [...bandUpper, ...bandLower].join(" ");

  // Y-axis ticks
  const yTicks: number[] = [];
  const yStep = range / 5;
  for (let v = min; v <= max + yStep * 0.1; v += yStep) yTicks.push(v);

  // Correlations
  const correlations = useMemo(() => {
    if (!correlatedMetrics || correlatedMetrics.length === 0) return [];
    return correlatedMetrics
      .map(m => ({ label: m.label, corr: pearsonCorrelation(sparkline, m.data) }))
      .filter(c => Math.abs(c.corr) > 0.3)
      .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
      .slice(0, 5);
  }, [correlatedMetrics, sparkline]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
    }} onClick={onClose}>
      <div style={{
        background: "rgba(26,30,56,0.97)", borderRadius: 12, padding: "24px 32px",
        maxWidth: 980, width: "95%", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Heading level={4} style={{ margin: 0, color: "#fff" }}>📈 Forecast: {label}</Heading>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{ background: "rgba(128,128,128,0.2)", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 4, padding: "4px 8px", color: "#fff", fontSize: 12 }}
            >
              {Object.entries(METHODS).map(([k, v]) => (
                <option key={k} value={k} style={{ background: "#1a1e38" }}>{v.label}</option>
              ))}
            </select>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
        </div>

        {/* Chart */}
        <div style={{ position: "relative" }} onMouseLeave={() => setHoverIdx(null)}>
          <svg
            width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = ((e.clientX - rect.left) / rect.width) * W;
              const idx = Math.round(((mx - padL) / plotW) * (allData.length - 1));
              setHoverIdx(Math.max(0, Math.min(allData.length - 1, idx)));
            }}
          >
            {/* Grid */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={padL} y1={toY(v)} x2={padL + plotW} y2={toY(v)} stroke="rgba(128,128,128,0.15)" />
                <text x={padL - 5} y={toY(v) + 3} fontSize="9" fill="rgba(255,255,255,0.5)" textAnchor="end">
                  {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(v % 1 === 0 ? 0 : 1)}
                </text>
              </g>
            ))}
            {/* "Now" divider */}
            <line x1={toX(sparkline.length - 1)} y1={padT} x2={toX(sparkline.length - 1)} y2={padT + plotH} stroke="rgba(255,255,255,0.3)" strokeDasharray="4,4" />
            <text x={toX(sparkline.length - 1)} y={padT - 5} fontSize="9" fill="rgba(255,255,255,0.5)" textAnchor="middle">Now</text>
            {/* Confidence band */}
            <polygon points={bandPoly} fill={color} fillOpacity={0.1} />
            {/* Historical */}
            <polyline points={histPts} fill="none" stroke={color} strokeWidth={2} />
            {/* Forecast */}
            <polyline points={fcPts} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6,4" opacity={0.8} />
            {/* Hover crosshair */}
            {hoverIdx !== null && (
              <>
                <line x1={toX(hoverIdx)} y1={padT} x2={toX(hoverIdx)} y2={padT + plotH} stroke="rgba(255,255,255,0.4)" strokeWidth={0.75} strokeDasharray="2,2" />
                <circle cx={toX(hoverIdx)} cy={toY(allData[hoverIdx])} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
              </>
            )}
          </svg>
          {/* Tooltip */}
          {hoverIdx !== null && (
            <div style={{
              position: "absolute", top: 10,
              left: Math.min(toX(hoverIdx) * (100 / W), 85) + "%",
              background: "rgba(0,0,0,0.9)", color: "#fff", padding: "6px 10px", borderRadius: 4,
              fontSize: 11, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 10,
            }}>
              <div style={{ fontWeight: 700 }}>{hoverIdx < sparkline.length ? "Actual" : "Forecast"}</div>
              <div>{allData[hoverIdx] >= 1000 ? `${(allData[hoverIdx] / 1000).toFixed(1)}k` : allData[hoverIdx].toFixed(1)}</div>
              {hoverIdx >= sparkline.length && (
                <div style={{ opacity: 0.7 }}>±{confidence[hoverIdx - sparkline.length]?.toFixed(1)}</div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          <span><span style={{ display: "inline-block", width: 16, height: 2, background: color, marginRight: 4, verticalAlign: "middle" }}></span>Historical</span>
          <span><span style={{ display: "inline-block", width: 16, height: 2, background: color, opacity: 0.6, marginRight: 4, verticalAlign: "middle", borderTop: `2px dashed ${color}` }}></span>Forecast</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: color, opacity: 0.1, border: `1px solid ${color}`, marginRight: 4, verticalAlign: "middle", borderRadius: 2 }}></span>Confidence</span>
        </div>

        {/* Correlated Metrics */}
        {correlations.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(128,128,128,0.2)", paddingTop: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 8, display: "block" }}>
              Correlated Metrics
            </Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {correlations.map((c, i) => (
                <div key={i} style={{
                  background: "rgba(128,128,128,0.1)", border: "1px solid rgba(128,128,128,0.2)",
                  borderRadius: 4, padding: "4px 10px", fontSize: 11, color: "rgba(255,255,255,0.8)",
                }}>
                  {c.label}
                  <span style={{ marginLeft: 6, fontWeight: 700, color: c.corr > 0 ? "#4589FF" : "#FF832B" }}>
                    r={c.corr.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
