import React, { useState, useMemo, useCallback, useRef } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Strong } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { AppHeader } from "../components/AppHeader";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { KpiCard, ForecastProvider } from "../components/KpiCard";
import { ForecastModal } from "../components/ForecastModal";
import { useTimeframe } from "../TimeframeContext";
import "../PatternProblems.css";
import type { AIInsightsData } from "../components/AIInsights";

export function NPlus1Trends() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const [scatterMaximized, setScatterMaximized] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: any } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);

  const tf = `from: ${timeframe.from}`;

  // Compute previous period
  const prevTf = useMemo(() => {
    const match = timeframe.from.match(/now\(\)-(\d+)([hdm])/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    return `from: now()-${num * 2}${unit}, to: now()-${num}${unit}`;
  }, [timeframe.from]);

  // Scatter: N+1 spans plotted over time (no sort = DQL returns spread across full timeframe)
  const scatterQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| fields end_time, aggregation.count, service_name = entityName(dt.entity.service), db.system`;

  // Estimated annual projection (weekly * 52)
  const annualQuery = `fetch spans, from: now()-7d
| filter db.system != "null"
| summarize c=count(), s= sum(aggregation.count),
            c1=countif(aggregation.count > 1), s1=sum(if(aggregation.count > 1, aggregation.count))
| fieldsAdd queryReduction = (toDouble(s1)-toDouble(c1))*52`;

  // Previous period counts for comparison
  const prevCountQuery = prevTf ? `fetch spans, ${prevTf}
| filter db.system != "null" and aggregation.count > 1
| summarize total = count(), high_impact = countif(aggregation.count > 50)
| fieldsAdd services = count()` : null;

  const scatterResult = useDql({ query: scatterQuery });
  const annualResult = useDql({ query: annualQuery });
  const prevCountResult = useDql({ query: prevCountQuery ?? "fetch spans, from: now()-1s | limit 0" });

  const scatterData = useMemo(() => {
    if (!scatterResult.data?.records) return [];
    return scatterResult.data.records.map((r: any) => ({
      time: new Date(String(r.end_time ?? "")).getTime(),
      count: Number(r["aggregation.count"] ?? 0),
      service: String(r.service_name ?? "Unknown"),
      db: String(r["db.system"] ?? ""),
    })).filter(d => !isNaN(d.time));
  }, [scatterResult.data]);

  const annualEstimate = useMemo(() => {
    const rec = annualResult.data?.records?.[0];
    return rec ? Number(rec.queryReduction ?? 0) : null;
  }, [annualResult.data]);

  const prevCounts = useMemo(() => {
    const rec = prevCountResult.data?.records?.[0] as any;
    if (!rec || !prevTf) return null;
    return {
      total: Number(rec.total ?? 0),
      highImpact: Number(rec.high_impact ?? 0),
    };
  }, [prevCountResult.data, prevTf]);

  const maxScatterCount = useMemo(() => Math.max(...scatterData.map(d => d.count), 1), [scatterData]);

  const analyzeTimeseries = useCallback((): AIInsightsData => {
    const insights: AIInsightsData["insights"] = [];
    const recs: AIInsightsData["recommendations"] = [];

    if (scatterData.length > 0) {
      const clustered = scatterData.filter(d => d.count > 50);
      if (clustered.length > 10) {
        insights.push({
          severity: "critical",
          icon: "📈",
          text: `${clustered.length} high-impact N+1 spans (>50 queries each) detected. Clustered patterns indicate systemic issues rather than isolated incidents.`,
        });
      }

      const services = new Set(scatterData.map(d => d.service));
      insights.push({
        severity: "info",
        icon: "🔍",
        text: `N+1 patterns distributed across ${services.size} services. Monitor trend direction to detect regressions after deployments.`,
      });
    }

    if (annualEstimate !== null && annualEstimate > 0) {
      insights.push({
        severity: annualEstimate > 1_000_000 ? "critical" : "warning",
        icon: "📅",
        text: `Projected ${annualEstimate.toLocaleString()} unnecessary queries per year if current patterns persist. At ~$0.000001/query, that's ~$${(annualEstimate * 0.000001).toFixed(2)} in wasted DB compute annually.`,
      });
    }

    recs.push({ impact: "high", text: "Set up automated alerts when N+1 query count exceeds baseline by 20% — catch regressions early after deployments." });
    recs.push({ impact: "medium", text: "Correlate N+1 trend spikes with deployment events to identify which code changes introduce patterns." });

    return {
      summary: `N+1 trend analysis shows ${scatterData.length} pattern occurrences in the current window. ${annualEstimate ? `Annual projection: ${annualEstimate.toLocaleString()} unnecessary queries.` : ""} Use the scatter plot to identify clusters of high-impact patterns.`,
      insights,
      recommendations: recs,
    };
  }, [scatterData, annualEstimate]);

  const [forecastState, setForecastState] = useState<{ label: string; sparkline: number[]; color?: string } | null>(null);
  const openForecast = useCallback((label: string, sparkline: number[], color?: string) => {
    setForecastState({ label, sparkline, color });
  }, []);

  const { panel: aiPanel } = useAIInsights(analyzeTimeseries, aiOpen, closeAi);

  // Build sparklines from scatter data (bucket by time)
  const trendSparklines = useMemo(() => {
    if (scatterData.length < 2) return { counts: [], highImpact: [] };
    const minT = Math.min(...scatterData.map(d => d.time));
    const maxT = Math.max(...scatterData.map(d => d.time));
    const bucketCount = 16;
    const bucketMs = (maxT - minT) / bucketCount || 1;
    const counts = new Array(bucketCount).fill(0);
    const highImpact = new Array(bucketCount).fill(0);
    for (const d of scatterData) {
      const idx = Math.min(Math.floor((d.time - minT) / bucketMs), bucketCount - 1);
      counts[idx] += d.count;
      if (d.count > 50) highImpact[idx]++;
    }
    return { counts, highImpact };
  }, [scatterData]);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <ForecastProvider value={openForecast}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />
      {aiPanel}

      {/* Annual estimate KPI */}
      <div className="pp-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard
          label="Est. Unnecessary Queries / Year"
          value={annualEstimate !== null ? annualEstimate.toLocaleString() : "—"}
          rawValue={annualEstimate ?? undefined}
          sparkline={trendSparklines.counts}
          color="#C21930"
        />
        <KpiCard
          label="High-Impact Spans (>50 queries)"
          value={scatterData.filter(d => d.count > 50).length}
          rawValue={scatterData.filter(d => d.count > 50).length}
          prevRawValue={prevCounts?.highImpact ?? null}
          sparkline={trendSparklines.highImpact}
          color="#FF832B"
        />
        <KpiCard
          label="Affected Services"
          value={new Set(scatterData.map(d => d.service)).size}
          rawValue={new Set(scatterData.map(d => d.service)).size}
          color="#4589FF"
        />
      </div>

      {/* Scatter plot */}
      <div className="pp-chart-card" style={{
        marginBottom: 20,
        ...(scatterMaximized ? { position: "fixed", inset: 0, zIndex: 99999, margin: 0, borderRadius: 0, overflow: "auto", background: "var(--dt-colors-surface-default, #1a1e38)" } : {}),
      }}>
        <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 8 }}>
          <div className="pp-chart-title" style={{ margin: 0 }}>N+1 Spans Over Time (Scatter)</div>
          <button
            onClick={() => setScatterMaximized(v => !v)}
            style={{ background: "rgba(128,128,128,0.1)", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "inherit" }}
          >
            {scatterMaximized ? "⊟ Minimize" : "⊞ Maximize"}
          </button>
        </Flex>
        {scatterResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : scatterData.length === 0 ? (
          <Text style={{ opacity: 0.5, padding: 20 }}>No N+1 patterns detected in this timeframe</Text>
        ) : (
          (() => {
            const chartH = scatterMaximized ? Math.max(window.innerHeight - 80, 500) : 400;
            const padL = 40, padR = 10, padT = 10, padB = 30;
            const viewW = 1000;
            const plotW = viewW - padL - padR;
            const plotH = chartH - padT - padB;
            const minTime = Math.min(...scatterData.map(d => d.time));
            const maxTime = Math.max(...scatterData.map(d => d.time));
            const timeRange = maxTime - minTime || 1;
            // Y-axis ticks
            const yMax = maxScatterCount;
            const yStep = Math.ceil(yMax / 8 / 50) * 50 || 50;
            const yTicks: number[] = [];
            for (let v = 0; v <= yMax; v += yStep) yTicks.push(v);
            // X-axis: auto-scale labels based on timeframe duration
            const durationDays = timeRange / (1000 * 60 * 60 * 24);
            let xTickCount: number;
            let formatLabel: (d: Date) => string;
            if (durationDays <= 1) {
              xTickCount = 12;
              formatLabel = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
            } else if (durationDays <= 7) {
              xTickCount = Math.min(14, Math.ceil(durationDays * 2));
              formatLabel = (d) => `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}\n${d.getHours() === 0 ? "" : d.getHours() + ":00"}`.trim();
            } else {
              xTickCount = Math.min(14, Math.ceil(durationDays));
              formatLabel = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }
            const xTicks: { time: number; label: string }[] = [];
            for (let i = 0; i <= xTickCount; i++) {
              const t = minTime + (timeRange * i) / xTickCount;
              xTicks.push({ time: t, label: formatLabel(new Date(t)) });
            }
            // Service colors
            const serviceColors: Record<string, string> = {};
            const palette = ["#4589FF","#C21930","#FF832B","#24A148","#A56EFF","#FF7EB6","#D2A106","#08BDBA","#BA4E00","#EE5396","#009D9A","#6929C4","#1192E8","#FA4D56","#570408","#002D9C"];
            const services = [...new Set(scatterData.map(d => d.service))];
            services.forEach((s, i) => { serviceColors[s] = palette[i % palette.length]; });

            return (
              <div
                ref={chartRef}
                style={{ position: "relative", height: chartH + 10 }}
                onMouseLeave={() => setTooltip(null)}
              >
                <svg
                  width="100%"
                  height={chartH}
                  viewBox={`0 0 ${viewW} ${chartH}`}
                  preserveAspectRatio="none"
                  style={{ display: "block" }}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mx = ((e.clientX - rect.left) / rect.width) * viewW;
                    const my = ((e.clientY - rect.top) / rect.height) * chartH;
                    // Find nearest dot
                    let best: any = null;
                    let bestDist = 20;
                    for (const d of scatterData) {
                      const dx = padL + ((d.time - minTime) / timeRange) * plotW;
                      const dy = padT + plotH - (d.count / yMax) * plotH;
                      const dist = Math.sqrt((mx - dx) ** 2 + (my - dy) ** 2);
                      if (dist < bestDist) { bestDist = dist; best = d; }
                    }
                    if (best) {
                      setTooltip({ x: e.clientX - (chartRef.current?.getBoundingClientRect().left ?? 0), y: e.clientY - (chartRef.current?.getBoundingClientRect().top ?? 0), data: best });
                    } else {
                      setTooltip(null);
                    }
                  }}
                >
                  {/* Y-axis grid + labels */}
                  {yTicks.map(v => {
                    const y = padT + plotH - (v / yMax) * plotH;
                    return (
                      <g key={`y-${v}`}>
                        <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(128,128,128,0.12)" />
                        <text x={padL - 4} y={y + 3} fontSize="9" fill="rgba(128,128,128,0.6)" textAnchor="end">{v}</text>
                      </g>
                    );
                  })}
                  {/* Y-axis title */}
                  <text x="10" y={chartH / 2} fontSize="9" fill="rgba(128,128,128,0.5)" textAnchor="middle" transform={`rotate(-90, 10, ${chartH / 2})`}>N+1 Queries</text>
                  {/* X-axis date labels */}
                  {xTicks.map((tick, i) => {
                    const x = padL + ((tick.time - minTime) / timeRange) * plotW;
                    return (
                      <g key={`x-${i}`}>
                        <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(128,128,128,0.06)" />
                        <text x={x} y={padT + plotH + 14} fontSize="8" fill="rgba(128,128,128,0.6)" textAnchor="middle">{tick.label}</text>
                      </g>
                    );
                  })}
                  {/* Dots colored by service */}
                  {scatterData.map((d, i) => {
                    const x = padL + ((d.time - minTime) / timeRange) * plotW;
                    const y = padT + plotH - (d.count / yMax) * plotH;
                    const r = Math.min(2 + (d.count / yMax) * 3, 5);
                    return <circle key={i} cx={x} cy={y} r={r} fill={serviceColors[d.service] || "#4589FF"} opacity={0.75} />;
                  })}
                </svg>
                {/* Tooltip */}
                {tooltip && (
                  <div style={{
                    position: "absolute",
                    left: tooltip.x + 12,
                    top: tooltip.y - 10,
                    background: "rgba(0,0,0,0.85)",
                    color: "#fff",
                    padding: "6px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    zIndex: 10,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}>
                    <div style={{ fontWeight: 700 }}>{tooltip.data.service}</div>
                    <div>Queries: <strong>{tooltip.data.count}</strong></div>
                    <div>DB: {tooltip.data.db}</div>
                    <div style={{ opacity: 0.7 }}>{new Date(tooltip.data.time).toLocaleString()}</div>
                  </div>
                )}
              </div>
            );
          })()
        )}
        <Text style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
          Each dot = one N+1 span. Color = service. Y-axis = query count. {scatterData.length.toLocaleString()} spans shown.
        </Text>
      </div>
      {forecastState && (
        <ForecastModal
          label={forecastState.label}
          sparkline={forecastState.sparkline}
          color={forecastState.color}
          onClose={() => setForecastState(null)}
          correlatedMetrics={[
            { label: "N+1 Query Volume", data: trendSparklines.counts },
            { label: "High-Impact Spans", data: trendSparklines.highImpact },
          ]}
        />
      )}
      </ForecastProvider>
    </AIInsightsContext.Provider>
  );
}
