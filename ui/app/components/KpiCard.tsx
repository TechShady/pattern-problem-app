import React, { createContext, useContext, useMemo, useState } from "react";
import { Text, Heading } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components/content";

// ─── Forecast Context ───
type ForecastOpener = (label: string, sparkline: number[], color?: string) => void;
const ForecastContext = createContext<ForecastOpener | null>(null);
export const ForecastProvider = ForecastContext.Provider;

const GREEN = "#0D9C29";
const RED = "#C21930";

function Sparkline({ data, color = "#4589FF" }: { data: number[]; color?: string }) {
  const W = 88;
  const H = 28;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const valid = data.filter((v) => v != null && !isNaN(v) && isFinite(v));
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const points = valid.map((v, i) => ({
    x: (i / (valid.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 4) - 2,
    value: v,
  }));
  const pts = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fillPts = `0,${H} ${pts} ${W},${H}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / W) * (valid.length - 1));
    setHoverIdx(Math.max(0, Math.min(valid.length - 1, idx)));
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <svg
        width={W} height={H}
        style={{ display: "block", marginTop: 6, opacity: 0.85, cursor: "crosshair" }}
        aria-hidden
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <polygon points={fillPts} fill={color} fillOpacity={0.1} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
        {hoverIdx !== null && points[hoverIdx] && (
          <>
            <line x1={points[hoverIdx].x} y1={0} x2={points[hoverIdx].x} y2={H} stroke={color} strokeWidth={0.75} strokeDasharray="2,2" opacity={0.6} />
            <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r={3} fill={color} stroke="#fff" strokeWidth={1} />
          </>
        )}
      </svg>
      {hoverIdx !== null && points[hoverIdx] && (
        <div style={{
          position: "absolute", bottom: H + 8,
          left: Math.min(Math.max(points[hoverIdx].x - 30, 0), W - 60),
          background: "rgba(0,0,0,0.85)", color: "#fff", fontSize: 10, fontWeight: 600,
          padding: "3px 6px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10,
        }}>
          {points[hoverIdx].value >= 1000
            ? `${(points[hoverIdx].value / 1000).toFixed(1)}k`
            : points[hoverIdx].value.toFixed(points[hoverIdx].value % 1 === 0 ? 0 : 1)}
        </div>
      )}
    </div>
  );
}

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  rawValue?: number;
  prevRawValue?: number | null;
  sparkline?: number[];
  color?: string;
  higherIsBetter?: boolean;
  isLoading?: boolean;
  style?: React.CSSProperties;
}

export function KpiCard({
  label, value, rawValue, prevRawValue, sparkline, color,
  higherIsBetter = false, isLoading, style,
}: KpiCardProps) {
  const forecastOpener = useContext(ForecastContext);
  const handleClick = sparkline && sparkline.length > 1 && forecastOpener
    ? () => forecastOpener(label, sparkline, color)
    : undefined;

  const delta = useMemo<number | null>(() => {
    if (rawValue == null || prevRawValue == null) return null;
    if (prevRawValue === 0) return rawValue === 0 ? 0 : 100;
    return ((rawValue - prevRawValue) / Math.abs(prevRawValue)) * 100;
  }, [rawValue, prevRawValue]);

  const trendUp = delta !== null && delta > 0;
  const trendGood = delta !== null && (higherIsBetter ? trendUp : !trendUp);
  const trendColor = delta === null ? undefined : delta === 0 ? undefined : trendGood ? GREEN : RED;
  const arrow = delta === 0 ? "—" : trendUp ? "↑" : "↓";

  return (
    <div
      className="pp-kpi-card"
      style={{
        cursor: handleClick ? "pointer" : undefined,
        transition: "box-shadow 0.15s",
        ...style,
      }}
      title={handleClick ? `${label} — click for forecast` : label}
      onClick={handleClick}
    >
      <div className="pp-kpi-card-label">{label}</div>
      {isLoading ? (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
          <ProgressCircle size="small" />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5, marginTop: 4 }}>
            <div className="pp-kpi-card-value" style={{ color, margin: 0 }}>{value}</div>
            {delta !== null && (
              <span
                style={{ fontSize: 11, fontWeight: 700, color: trendColor, whiteSpace: "nowrap", lineHeight: 1 }}
                title={`vs previous period: ${trendUp ? "+" : ""}${delta.toFixed(1)}%`}
              >
                {arrow}&thinsp;{Math.abs(delta).toFixed(1)}%
              </span>
            )}
          </div>
          {sparkline && sparkline.length > 1 && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Sparkline data={sparkline} color={color ?? "#4589FF"} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
