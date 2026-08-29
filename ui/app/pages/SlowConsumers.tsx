import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text, Strong } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { AppHeader } from "../components/AppHeader";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { KpiCard, ForecastProvider } from "../components/KpiCard";
import { ForecastModal } from "../components/ForecastModal";
import { useTimeframe, getBinSize } from "../TimeframeContext";
import { loadCostSettings, COST_SETTINGS_EVENT, CostSettings, getAnnualMultiplier, fmt } from "../CostSettings";
import "../PatternProblems.css";
import type { AIInsightsData } from "../components/AIInsights";

let ENV_URL = "";
try { ENV_URL = getEnvironmentUrl(); } catch { /* dev fallback */ }

export function SlowConsumers() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);
  const [costSettings, setCostSettings] = useState<CostSettings>(loadCostSettings);
  useEffect(() => {
    const refresh = () => setCostSettings(loadCostSettings());
    window.addEventListener(COST_SETTINGS_EVENT, refresh);
    return () => window.removeEventListener(COST_SETTINGS_EVENT, refresh);
  }, []);

  const tf = `from: ${timeframe.from}`;
  const annualMultiplier = useMemo(() => getAnnualMultiplier(timeframe.from), [timeframe.from]);

  // Compute previous period
  const prevTf = useMemo(() => {
    const match = timeframe.from.match(/now\(\)-(\d+)([hdm])/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    return `from: now()-${num * 2}${unit}, to: now()-${num}${unit}`;
  }, [timeframe.from]);

  // Sparkline: slow consumer count + long-tail count over time
  const binSize = getBinSize(timeframe.from);
  const sparklineQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd duration_ms = toDouble(duration) / 1000000.0
| summarize high_variance_count = countif(duration_ms > 5000), total_spans = count(), avg_duration = avg(duration_ms), by:{timeframe = bin(end_time, ${binSize})}
| sort timeframe`;

  // Previous period aggregates
  const prevQuery = prevTf ? `fetch spans, ${prevTf}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            duration_ms = toDouble(duration) / 1000000.0
| summarize avg_duration_ms = avg(duration_ms),
            p99_duration_ms = percentile(duration_ms, 99),
            total_spans = count(),
            by: { service_name }
| fieldsAdd variance_ratio = p99_duration_ms / avg_duration_ms
| summarize high_var_services = countif(variance_ratio > 5 and total_spans > 10),
            long_tail_count = countif(p99_duration_ms > 5000),
            max_variance = max(variance_ratio)` : null;

  // Detect slow consumers: spans with disproportionately long duration compared to siblings
  const slowConsumerQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            service_id = toString(dt.entity.service),
            duration_ms = toDouble(duration) / 1000000.0
| summarize avg_duration_ms = avg(duration_ms),
            p95_duration_ms = percentile(duration_ms, 95),
            p99_duration_ms = percentile(duration_ms, 99),
            max_duration_ms = max(duration_ms),
            total_spans = count(),
            by: { service_name, service_id }
| fieldsAdd variance_ratio = p99_duration_ms / avg_duration_ms
| filter variance_ratio > 5 and total_spans > 10
| sort variance_ratio desc
| limit 50`;

  // Long-tail spans (individual slow executions)
  const longTailQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            service_id = toString(dt.entity.service),
            duration_ms = toDouble(duration) / 1000000.0
| filter duration_ms > 5000
| fields service_name, service_id, span.name, duration_ms, trace.id
| sort duration_ms desc
| limit 100`;

  const slowResult = useDql({ query: slowConsumerQuery });
  const longTailResult = useDql({ query: longTailQuery });
  const sparklineResult = useDql({ query: sparklineQuery });
  const prevResult = useDql({ query: prevQuery ?? "fetch spans, from: now()-1s | limit 0" });

  const sparklines = useMemo(() => {
    const records = sparklineResult.data?.records;
    if (!records || records.length < 2) return { highVariance: [] as number[], avgDuration: [] as number[] };
    return {
      highVariance: records.map((r: any) => Number(r.high_variance_count ?? 0)),
      avgDuration: records.map((r: any) => Number(r.avg_duration ?? 0)),
    };
  }, [sparklineResult.data]);

  const prev = useMemo(() => {
    const rec = prevResult.data?.records?.[0] as any;
    if (!rec || !prevTf) return null;
    return {
      highVarServices: Number(rec.high_var_services ?? 0),
      longTailCount: Number(rec.long_tail_count ?? 0),
      maxVariance: Number(rec.max_variance ?? 0),
    };
  }, [prevResult.data, prevTf]);

  const slowData = useMemo(() => {
    if (!slowResult.data?.records) return [];
    return slowResult.data.records.map((r: any) => ({
      serviceName: String(r.service_name ?? "Unknown"),
      entityId: String(r.service_id ?? ""),
      avgDuration: Number(r.avg_duration_ms ?? 0),
      p95Duration: Number(r.p95_duration_ms ?? 0),
      p99Duration: Number(r.p99_duration_ms ?? 0),
      maxDuration: Number(r.max_duration_ms ?? 0),
      totalSpans: Number(r.total_spans ?? 0),
      varianceRatio: Number(r.variance_ratio ?? 0),
    }));
  }, [slowResult.data]);

  const longTailData = useMemo(() => {
    if (!longTailResult.data?.records) return [];
    return longTailResult.data.records.map((r: any) => ({
      serviceName: String(r.service_name ?? "Unknown"),
      entityId: String(r.service_id ?? ""),
      spanName: String(r["span.name"] ?? ""),
      durationMs: Number(r.duration_ms ?? 0),
      traceId: String(r["trace.id"] ?? ""),
    }));
  }, [longTailResult.data]);

  const costImpact = useMemo(() => {
    if (slowData.length === 0) return null;
    // Wasted milliseconds: total_spans × (p99 - avg) per service
    const totalWastedMs = slowData.reduce((s, d) => s + d.totalSpans * Math.max(0, d.p99Duration - d.avgDuration), 0);
    const annualWastedSeconds = (totalWastedMs / 1000) * annualMultiplier;
    // Server cost per second (annual server cost / seconds in a year)
    const serverCostPerSecond = (costSettings.monthlyAppServerCost * 12) / (365 * 24 * 3600);
    const computeWaste = annualWastedSeconds * serverCostPerSecond;
    // Retry overhead: long-tail spans trigger timeouts → retries → extra compute
    const annualLongTailSpans = longTailData.length * annualMultiplier;
    const retryOverhead = annualLongTailSpans * 3 * (costSettings.costPerMillionApiRequests / 1_000_000);
    // Engineering: incidents scaled by number of high-variance services
    const incidentFraction = Math.min(1, slowData.length / 5);
    const engineeringSavings = costSettings.monthlyDbIncidents * 12 * costSettings.avgMttrHours * costSettings.engineersPerIncident * costSettings.engineerHourlyRate * incidentFraction;
    const total = computeWaste + retryOverhead + engineeringSavings;
    return { computeWaste, retryOverhead, engineeringSavings, total, annualWastedSeconds };
  }, [slowData, longTailData, annualMultiplier, costSettings]);

  const columns = useMemo(() => [
    {
      id: "serviceName", header: "Service", accessor: "serviceName", width: 200,
      cell: ({ value, rowData }: any) => (
        <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?filter=dt.entity.service+%3D+${encodeURIComponent(rowData?.entityId || '')}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 13 }}>{value}</a>
      ),
    },
    {
      id: "varianceRatio",
      header: "Variance Ratio (p99/avg)",
      accessor: "varianceRatio",
      width: 160,
      cell: ({ value }: any) => (
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 13,
          background: value > 20 ? "rgba(194,25,48,0.15)" : value > 10 ? "rgba(255,131,43,0.15)" : "rgba(69,137,255,0.1)",
          color: value > 20 ? "#C21930" : value > 10 ? "#FF832B" : "#4589FF",
        }}>{value?.toFixed(1)}x</span>
      ),
    },
    { id: "avgDuration", header: "Avg (ms)", accessor: "avgDuration", width: 100,
      cell: ({ value }: any) => <span>{value?.toFixed(0)}</span> },
    { id: "p95Duration", header: "P95 (ms)", accessor: "p95Duration", width: 100,
      cell: ({ value }: any) => <span>{value?.toFixed(0)}</span> },
    { id: "p99Duration", header: "P99 (ms)", accessor: "p99Duration", width: 100,
      cell: ({ value }: any) => <span style={{ fontWeight: 600 }}>{value?.toFixed(0)}</span> },
    { id: "maxDuration", header: "Max (ms)", accessor: "maxDuration", width: 100,
      cell: ({ value }: any) => <span style={{ color: "#C21930", fontWeight: 600 }}>{value?.toFixed(0)}</span> },
    { id: "totalSpans", header: "Spans", accessor: "totalSpans", width: 80 },
  ], []);

  const analyzeSlowConsumers = useCallback((): AIInsightsData => {
    const insights: AIInsightsData["insights"] = [];
    const recs: AIInsightsData["recommendations"] = [];

    if (slowData.length > 0) {
      const worst = slowData[0];
      insights.push({
        severity: "critical",
        icon: "🐌",
        text: `"${worst.serviceName}" has a ${worst.varianceRatio.toFixed(0)}x variance ratio (p99: ${worst.p99Duration.toFixed(0)}ms vs avg: ${worst.avgDuration.toFixed(0)}ms). Severe long-tail latency.`,
      });

      const highVariance = slowData.filter(d => d.varianceRatio > 20);
      if (highVariance.length > 0) {
        insights.push({
          severity: "warning",
          icon: "📊",
          text: `${highVariance.length} services have >20x variance ratio — indicating intermittent resource contention or blocking operations.`,
        });
      }
    }

    if (longTailData.length > 0) {
      insights.push({
        severity: "warning",
        icon: "⏱️",
        text: `${longTailData.length} individual spans exceed 5 seconds duration. Longest: ${(longTailData[0]?.durationMs / 1000).toFixed(1)}s in "${longTailData[0]?.serviceName}".`,
      });
    }

    if (costImpact) {
      insights.push({
        severity: costImpact.total > 10000 ? "critical" : "warning",
        icon: "💰",
        text: `Projected annual cost impact: ${fmt(costImpact.total)} from wasted compute, retry overhead, and engineering incidents from slow consumer patterns.`,
      });
    }

    recs.push({ impact: "high", text: "Implement async processing with backpressure mechanisms (e.g., reactive streams, bounded queues) for slow consumers." });
    recs.push({ impact: "high", text: "Add timeout boundaries and circuit breakers to prevent slow consumers from blocking upstream services." });
    recs.push({ impact: "medium", text: "Profile long-tail spans for GC pauses, lock contention, or synchronous I/O that causes intermittent slowdowns." });
    recs.push({ impact: "low", text: "Consider horizontal scaling with partitioned consumers to distribute load more evenly." });

    return {
      summary: slowData.length > 0
        ? `Detected ${slowData.length} services with slow consumer characteristics (high p99/avg variance). These services process some requests orders of magnitude slower than average, indicating resource contention, blocking I/O, or insufficient capacity.`
        : "No significant slow consumer patterns detected. Service latency distributions appear healthy.",
      insights,
      recommendations: recs,
    };
  }, [slowData, longTailData, costImpact]);

  const { panel: aiPanel } = useAIInsights(analyzeSlowConsumers, aiOpen, closeAi);

  const [forecastState, setForecastState] = useState<{ label: string; sparkline: number[]; color?: string } | null>(null);
  const openForecast = useCallback((label: string, sparkline: number[], color?: string) => {
    setForecastState({ label, sparkline, color });
  }, []);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <ForecastProvider value={openForecast}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />

      <div className="pp-intro-banner">
        <p>
          <Strong>Slow Consumer Pattern:</Strong> A service processes some requests dramatically slower than others
          (high p99/avg ratio). This indicates intermittent resource contention, synchronous blocking, GC pressure,
          or insufficient capacity. Slow consumers cause queue buildup, timeouts, and cascading back-pressure.
        </p>
      </div>

      {aiPanel}

      {/* KPI summary */}
      <div className="pp-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard
          label="Services with High Variance"
          value={slowData.length}
          rawValue={slowData.length}
          prevRawValue={prev?.highVarServices ?? null}
          sparkline={sparklines.highVariance}
          color={slowData.length > 5 ? "#C21930" : slowData.length > 0 ? "#FF832B" : "#24A148"}
          isLoading={slowResult.isLoading || sparklineResult.isLoading}
        />
        <KpiCard
          label="Long-Tail Spans (>5s)"
          value={longTailData.length}
          rawValue={longTailData.length}
          prevRawValue={prev?.longTailCount ?? null}
          sparkline={sparklines.highVariance}
          color={longTailData.length > 20 ? "#C21930" : "#FF832B"}
          isLoading={longTailResult.isLoading}
        />
        <KpiCard
          label="Worst Variance Ratio"
          value={slowData.length > 0 ? `${slowData[0].varianceRatio.toFixed(0)}x` : "—"}
          rawValue={slowData.length > 0 ? slowData[0].varianceRatio : undefined}
          prevRawValue={prev?.maxVariance ?? null}
          sparkline={sparklines.avgDuration}
          color="#C21930"
          isLoading={slowResult.isLoading}
        />
      </div>

      {/* Cost Impact */}
      {costImpact && (
        <div className="pp-cost-section">
          <div className="pp-cost-section-header">
            <span className="pp-cost-section-title">Projected Annual Cost Impact</span>
            <span className="pp-cost-section-meta">
              Based on {timeframe.displayLabel} avg annualized (&times;{annualMultiplier}) &mdash; adjust assumptions via the settings icon above
            </span>
          </div>
          <div className="pp-cost-grid">
            <div className="pp-cost-card">
              <div className="pp-cost-card-label">Server Compute Waste</div>
              <div className="pp-cost-card-value">{fmt(costImpact.computeWaste)}</div>
              <div className="pp-cost-card-basis">
                {Math.round(costImpact.annualWastedSeconds).toLocaleString()}s wasted compute/yr &times; ${costSettings.monthlyAppServerCost.toLocaleString()}/mo server cost
              </div>
            </div>
            <div className="pp-cost-card">
              <div className="pp-cost-card-label">Retry &amp; Timeout Overhead</div>
              <div className="pp-cost-card-value">{fmt(costImpact.retryOverhead)}</div>
              <div className="pp-cost-card-basis">
                {longTailData.length} long-tail spans &times; {annualMultiplier}× &times; 3 avg retries
              </div>
            </div>
            <div className="pp-cost-card">
              <div className="pp-cost-card-label">Engineering &amp; Incidents</div>
              <div className="pp-cost-card-value">{fmt(costImpact.engineeringSavings)}</div>
              <div className="pp-cost-card-basis">
                {costSettings.monthlyDbIncidents} incidents/mo &times; {costSettings.avgMttrHours}h &times; {costSettings.engineersPerIncident} eng (scaled to {slowData.length} services)
              </div>
            </div>
          </div>
          <div className="pp-cost-total">
            <span className="pp-cost-total-label">Total Estimated Annual Savings</span>
            <span className="pp-cost-total-value">{fmt(costImpact.total)}</span>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="pp-table-section" style={{ marginBottom: 20 }}>
        <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 12 }}>
          <div className="pp-table-title">Services with High Latency Variance (p99/avg &gt; 5x)</div>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{slowData.length} services</Text>
        </Flex>
        {slowResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : (
          <DataTable data={slowData} columns={columns} sortable resizable>
            <DataTable.Pagination defaultPageSize={25} />
          </DataTable>
        )}
      </div>

      {/* Long-tail spans */}
      <div className="pp-chart-card">
        <div className="pp-chart-title">Longest Individual Spans (&gt;5s)</div>
        {longTailResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : longTailData.length === 0 ? (
          <Text style={{ opacity: 0.5 }}>No long-tail spans detected</Text>
        ) : (
          <div>
            {longTailData.slice(0, 15).map((span, i) => (
              <Flex key={i} justifyContent="space-between" alignItems="center" style={{ padding: "6px 0", borderBottom: "1px solid rgba(128,128,128,0.06)" }}>
                <Flex gap={8} alignItems="center" style={{ flex: 1, minWidth: 0 }}>
                  <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?filter=dt.entity.service+%3D+${encodeURIComponent(span.entityId)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>{span.serviceName}</a>
                  <Text style={{ fontSize: 11, opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{span.spanName}</Text>
                </Flex>
                <Flex gap={8} alignItems="center">
                  {span.traceId && (
                    <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?traceId=${span.traceId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", fontSize: 11 }}>trace</a>
                  )}
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700,
                    background: "rgba(194,25,48,0.1)", color: "#C21930",
                  }}>{(span.durationMs / 1000).toFixed(1)}s</span>
                </Flex>
              </Flex>
            ))}
          </div>
        )}
      </div>
      {forecastState && (
        <ForecastModal
          label={forecastState.label}
          sparkline={forecastState.sparkline}
          color={forecastState.color}
          onClose={() => setForecastState(null)}
        />
      )}
      </ForecastProvider>
    </AIInsightsContext.Provider>
  );
}
