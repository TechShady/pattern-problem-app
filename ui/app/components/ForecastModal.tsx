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

// ─── Helper: detect dominant season length via autocorrelation ───
function detectSeasonLength(data: number[]): number {
  const n = data.length;
  if (n < 8) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const centered = data.map((v) => v - mean);
  const maxLag = Math.floor(n / 2);
  const acf: number[] = [];
  const variance = centered.reduce((a, v) => a + v * v, 0);
  if (variance === 0) return 0;
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += centered[i] * centered[i + lag];
    acf.push(sum / variance);
  }
  let bestLag = 0, bestVal = -Infinity;
  for (let lag = 2; lag < acf.length; lag++) {
    if (acf[lag] > bestVal && acf[lag] > acf[lag - 1] && (lag === acf.length - 1 || acf[lag] >= acf[lag + 1])) {
      bestVal = acf[lag]; bestLag = lag; break;
    }
  }
  return bestVal > 0.1 ? bestLag : Math.min(24, Math.floor(n / 4));
}

// ─── Helper: fit AR coefficients via Yule-Walker ───
function fitAR(data: number[], order: number): number[] {
  const n = data.length;
  if (n <= order) return new Array(order).fill(0);
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const centered = data.map((v) => v - mean);
  const r: number[] = new Array(order + 1).fill(0);
  for (let lag = 0; lag <= order; lag++) { for (let i = 0; i < n - lag; i++) r[lag] += centered[i] * centered[i + lag]; r[lag] /= n; }
  if (r[0] === 0) return new Array(order).fill(0);
  const coeffs: number[] = new Array(order).fill(0);
  const prevCoeffs: number[] = new Array(order).fill(0);
  coeffs[0] = r[1] / r[0];
  let err = r[0] * (1 - coeffs[0] * coeffs[0]);
  for (let m = 1; m < order; m++) {
    let lambda = r[m + 1];
    for (let j = 0; j < m; j++) lambda -= coeffs[j] * r[m - j];
    if (Math.abs(err) < 1e-12) break;
    const k = lambda / err;
    for (let j = 0; j < m; j++) prevCoeffs[j] = coeffs[j];
    coeffs[m] = k;
    for (let j = 0; j < m; j++) coeffs[j] = prevCoeffs[j] - k * prevCoeffs[m - 1 - j];
    err *= 1 - k * k;
    if (err <= 0) break;
  }
  return coeffs;
}

function fitMA(residuals: number[], order: number): number[] {
  const n = residuals.length;
  if (n <= order) return new Array(order).fill(0);
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  const centered = residuals.map((v) => v - mean);
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += centered[i] * centered[i];
  if (r0 === 0) return new Array(order).fill(0);
  const coeffs: number[] = [];
  for (let lag = 1; lag <= order; lag++) {
    let rk = 0;
    for (let i = lag; i < n; i++) rk += centered[i] * centered[i - lag];
    coeffs.push(Math.max(-0.9, Math.min(0.9, rk / r0)));
  }
  return coeffs;
}

function fitSeasonalAR(data: number[], order: number, season: number): number[] {
  const n = data.length;
  if (n <= order * season) return new Array(order).fill(0);
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const centered = data.map((v) => v - mean);
  const coeffs: number[] = [];
  for (let j = 0; j < order; j++) {
    const lag = (j + 1) * season;
    if (lag >= n) { coeffs.push(0); continue; }
    let num = 0, den = 0;
    for (let i = lag; i < n; i++) { num += centered[i] * centered[i - lag]; den += centered[i - lag] * centered[i - lag]; }
    coeffs.push(den !== 0 ? num / den : 0);
  }
  return coeffs;
}

function fitSeasonalMA(residuals: number[], order: number, season: number): number[] {
  const n = residuals.length;
  if (n <= order * season) return new Array(order).fill(0);
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  const centered = residuals.map((v) => v - mean);
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += centered[i] * centered[i];
  if (r0 === 0) return new Array(order).fill(0);
  const coeffs: number[] = [];
  for (let j = 0; j < order; j++) {
    const lag = (j + 1) * season;
    if (lag >= n) { coeffs.push(0); continue; }
    let rk = 0;
    for (let i = lag; i < n; i++) rk += centered[i] * centered[i - lag];
    coeffs.push(Math.max(-0.9, Math.min(0.9, rk / r0)));
  }
  return coeffs;
}

// ─── Prophet-style forecast (piecewise linear trend + Fourier seasonality) ───
function prophetForecast(data: number[]): { forecast: number[]; confidence: number[] } {
  const n = data.length;
  const forecastLen = Math.max(Math.round(n * 0.4), 6);
  if (n < 4) return linearRegression(data);
  // Piecewise trend
  const numCp = Math.min(Math.max(2, Math.floor(n / 10)), 25);
  const cpIndices: number[] = [];
  for (let i = 1; i <= numCp; i++) cpIndices.push(Math.round((i / (numCp + 1)) * n * 0.8));
  const breakpoints = [0, ...cpIndices, n - 1];
  const trend: number[] = new Array(n).fill(0);
  for (let seg = 0; seg < breakpoints.length - 1; seg++) {
    const start = breakpoints[seg], end = breakpoints[seg + 1];
    if (end <= start) continue;
    for (let i = start; i <= end; i++) trend[i] = data[start] + ((i - start) / (end - start)) * (data[end] - data[start]);
  }
  // Smooth trend
  const windowSize = Math.max(3, Math.floor(n / 20));
  const smoothed: number[] = [...trend];
  for (let i = 0; i < n; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(n - 1, i + windowSize); j++) { sum += trend[j]; count++; }
    smoothed[i] = sum / count;
  }
  // Fourier seasonality
  const detrended = data.map((v, i) => v - smoothed[i]);
  const period = detectSeasonLength(detrended) || Math.min(n, 24);
  const numHarmonics = Math.min(4, Math.floor(period / 2));
  const coeffs: { a: number; b: number; freq: number }[] = [];
  for (let h = 1; h <= numHarmonics; h++) {
    const freq = (2 * Math.PI * h) / period;
    let sumCos = 0, sumSin = 0;
    for (let i = 0; i < n; i++) { sumCos += detrended[i] * Math.cos(freq * i); sumSin += detrended[i] * Math.sin(freq * i); }
    coeffs.push({ a: (2 * sumCos) / n, b: (2 * sumSin) / n, freq });
  }
  const lastSlope = n >= 2 ? (smoothed[n - 1] - smoothed[n - 2]) : 0;
  const lastLevel = smoothed[n - 1];
  let sse = 0;
  for (let i = 0; i < n; i++) {
    let s = 0; for (const c of coeffs) s += c.a * Math.cos(c.freq * i) + c.b * Math.sin(c.freq * i);
    sse += (data[i] - (smoothed[i] + s)) ** 2;
  }
  const std = Math.sqrt(sse / n);
  const forecast: number[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < forecastLen; i++) {
    let s = 0; for (const c of coeffs) s += c.a * Math.cos(c.freq * (n + i)) + c.b * Math.sin(c.freq * (n + i));
    forecast.push(Math.max(0, lastLevel + lastSlope * (i + 1) + s));
    confidence.push(std * (1 + 0.1 * i));
  }
  return { forecast, confidence };
}

// ─── ARIMA(p, d, q) forecast ───
function arimaForecast(data: number[]): { forecast: number[]; confidence: number[] } {
  const n = data.length;
  const p = 5, d = 1, q = 2;
  const forecastLen = Math.max(Math.round(n * 0.4), 6);
  if (n < p + d + 2) return linearRegression(data);
  // Difference
  let diffed = [...data];
  const diffHistory: number[][] = [];
  for (let dd = 0; dd < d; dd++) {
    diffHistory.push([...diffed]);
    const newDiff: number[] = [];
    for (let i = 1; i < diffed.length; i++) newDiff.push(diffed[i] - diffed[i - 1]);
    diffed = newDiff;
  }
  const arCoeffs = fitAR(diffed, p);
  const residuals: number[] = new Array(diffed.length).fill(0);
  for (let i = p; i < diffed.length; i++) {
    let predicted = 0;
    for (let j = 0; j < p; j++) predicted += arCoeffs[j] * diffed[i - j - 1];
    residuals[i] = diffed[i] - predicted;
  }
  const maCoeffs = fitMA(residuals, q);
  const extended = [...diffed];
  const extResiduals = [...residuals];
  for (let i = 0; i < forecastLen; i++) {
    let fc = 0;
    for (let j = 0; j < p; j++) { const idx = extended.length - j - 1; if (idx >= 0) fc += arCoeffs[j] * extended[idx]; }
    for (let j = 0; j < q; j++) { const idx = extResiduals.length - j - 1; if (idx >= 0) fc += maCoeffs[j] * extResiduals[idx]; }
    extended.push(fc);
    extResiduals.push(0);
  }
  // Integrate back
  let result = extended.slice(diffed.length);
  for (let dd = d - 1; dd >= 0; dd--) {
    const prev = diffHistory[dd];
    const integrated: number[] = [];
    let lastVal = prev[prev.length - 1];
    for (let i = 0; i < result.length; i++) { lastVal = lastVal + result[i]; integrated.push(lastVal); }
    result = integrated;
  }
  // Confidence
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const forecast = result.map((v) => Math.max(0, v));
  const confidence = forecast.map((_, i) => std * (1 + 0.12 * i));
  return { forecast, confidence };
}

// ─── SARIMA(p, d, q)(P, D, Q, m) forecast ───
function sarimaForecast(data: number[]): { forecast: number[]; confidence: number[] } {
  const n = data.length;
  const p = 3, d = 1, q = 1, P = 1, D = 1, Q = 1;
  const forecastLen = Math.max(Math.round(n * 0.4), 6);
  const season = detectSeasonLength(data) || Math.min(Math.max(4, Math.floor(n / 4)), 12);
  if (n < season * 2 + p + d) return arimaForecast(data);
  // Seasonal difference
  let diffed = [...data];
  const sDiffHistory: number[][] = [];
  for (let dd = 0; dd < D; dd++) {
    sDiffHistory.push([...diffed]);
    const newDiff: number[] = [];
    for (let i = season; i < diffed.length; i++) newDiff.push(diffed[i] - diffed[i - season]);
    diffed = newDiff;
  }
  // Regular difference
  const rDiffHistory: number[][] = [];
  for (let dd = 0; dd < d; dd++) {
    rDiffHistory.push([...diffed]);
    const newDiff: number[] = [];
    for (let i = 1; i < diffed.length; i++) newDiff.push(diffed[i] - diffed[i - 1]);
    diffed = newDiff;
  }
  const arCoeffs = fitAR(diffed, p);
  const sarCoeffs = fitSeasonalAR(diffed, P, season);
  const residuals: number[] = new Array(diffed.length).fill(0);
  const startIdx = Math.max(p, P * season);
  for (let i = startIdx; i < diffed.length; i++) {
    let predicted = 0;
    for (let j = 0; j < p; j++) predicted += arCoeffs[j] * diffed[i - j - 1];
    for (let j = 0; j < P; j++) { const idx = i - (j + 1) * season; if (idx >= 0) predicted += sarCoeffs[j] * diffed[idx]; }
    residuals[i] = diffed[i] - predicted;
  }
  const maCoeffs = fitMA(residuals, q);
  const smaCoeffs = fitSeasonalMA(residuals, Q, season);
  const extended = [...diffed];
  const extResiduals = [...residuals];
  for (let i = 0; i < forecastLen; i++) {
    let fc = 0;
    for (let j = 0; j < p; j++) { const idx = extended.length - j - 1; if (idx >= 0) fc += arCoeffs[j] * extended[idx]; }
    for (let j = 0; j < P; j++) { const idx = extended.length - (j + 1) * season; if (idx >= 0) fc += sarCoeffs[j] * extended[idx]; }
    for (let j = 0; j < q; j++) { const idx = extResiduals.length - j - 1; if (idx >= 0) fc += maCoeffs[j] * extResiduals[idx]; }
    for (let j = 0; j < Q; j++) { const idx = extResiduals.length - (j + 1) * season; if (idx >= 0) fc += smaCoeffs[j] * extResiduals[idx]; }
    extended.push(fc);
    extResiduals.push(0);
  }
  // Integrate regular difference
  let result = extended.slice(diffed.length);
  for (let dd = d - 1; dd >= 0; dd--) {
    const prev = rDiffHistory[dd];
    const integrated: number[] = [];
    let lastVal = prev[prev.length - 1];
    for (let i = 0; i < result.length; i++) { lastVal = lastVal + result[i]; integrated.push(lastVal); }
    result = integrated;
  }
  // Integrate seasonal difference
  for (let dd = D - 1; dd >= 0; dd--) {
    const prev = sDiffHistory[dd];
    const integrated: number[] = [];
    for (let i = 0; i < result.length; i++) {
      const base = i < season ? prev[prev.length - season + i] : integrated[i - season];
      integrated.push(base + result[i]);
    }
    result = integrated;
  }
  // Confidence
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const forecast = result.map((v) => Math.max(0, v));
  const confidence = forecast.map((_, i) => std * (1 + 0.1 * i));
  return { forecast, confidence };
}

const METHODS: Record<string, { label: string; fn: (d: number[]) => { forecast: number[]; confidence: number[] } }> = {
  holt: { label: "Holt-Winters (Double Exp.)", fn: holtWinters },
  triple: { label: "Triple Exp. Smoothing", fn: tripleExponential },
  prophet: { label: "Prophet", fn: prophetForecast },
  arima: { label: "ARIMA", fn: arimaForecast },
  sarima: { label: "SARIMA", fn: sarimaForecast },
  linear: { label: "Linear Regression", fn: linearRegression },
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
