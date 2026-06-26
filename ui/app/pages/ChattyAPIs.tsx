import React, { useState, useMemo, useCallback } from "react";
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
import "../PatternProblems.css";
import type { AIInsightsData } from "../components/AIInsights";

let ENV_URL = "";
try { ENV_URL = getEnvironmentUrl(); } catch { /* dev fallback */ }

export function ChattyAPIs() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const [forecastState, setForecastState] = useState<{ label: string; sparkline: number[]; color?: string } | null>(null);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);
  const openForecast = useCallback((label: string, sparkline: number[], color?: string) => {
    setForecastState({ label, sparkline, color });
  }, []);

  const tf = `from: ${timeframe.from}`;
  const binSize = getBinSize(timeframe.from);

  // Compute previous period
  const prevTf = useMemo(() => {
    const match = timeframe.from.match(/now\(\)-(\d+)([hdm])/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    return `from: now()-${num * 2}${unit}, to: now()-${num}${unit}`;
  }, [timeframe.from]);

  // Chatty APIs: services with high fan-out per trace (many spans in a single trace)
  const chattyQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller_service = entityName(dt.entity.service),
            caller_id = toString(dt.entity.service),
            trace_id = toString(trace.id)
| summarize call_count = count(),
            distinct_targets = countDistinctExact(span.name),
            by: { caller_service, caller_id, trace_id }
| filter call_count > 20
| sort call_count desc
| limit 100`;

  // Service-level chatty summary
  const chattySummaryQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller_service = entityName(dt.entity.service),
            caller_id = toString(dt.entity.service)
| summarize total_calls = count(),
            by: { caller_service, caller_id }
| filter total_calls > 50
| sort total_calls desc
| limit 20`;

  const chattyResult = useDql({ query: chattyQuery });
  const summaryResult = useDql({ query: chattySummaryQuery });

  // Sparkline: chatty patterns over time
  const sparklineQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller_service = entityName(dt.entity.service),
            trace_id = toString(trace.id)
| summarize call_count = count(), by: { caller_service, trace_id, timeframe = bin(end_time, ${binSize}) }
| filter call_count > 20
| summarize chatty_traces = count(), total_calls = sum(call_count), by: { timeframe }
| sort timeframe`;

  // Previous period aggregates
  const prevQuery = prevTf ? `fetch spans, ${prevTf}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller_service = entityName(dt.entity.service),
            trace_id = toString(trace.id)
| summarize call_count = count(),
            distinct_targets = countDistinctExact(span.name),
            by: { caller_service, trace_id }
| filter call_count > 20
| summarize chatty_traces = count(), chatty_services = countDistinct(caller_service), max_fan_out = max(call_count)` : null;

  const sparklineResult = useDql({ query: sparklineQuery });
  const prevResult = useDql({ query: prevQuery ?? "fetch spans, from: now()-1s | limit 0" });

  const chattyData = useMemo(() => {
    if (!chattyResult.data?.records) return [];
    return chattyResult.data.records.map((r: any) => ({
      callerService: String(r.caller_service ?? "Unknown"),
      callerId: String(r.caller_id ?? ""),
      traceId: String(r.trace_id ?? ""),
      callCount: Number(r.call_count ?? 0),
      distinctTargets: Number(r.distinct_targets ?? 0),
    }));
  }, [chattyResult.data]);

  const summaryData = useMemo(() => {
    if (!summaryResult.data?.records) return [];
    return summaryResult.data.records.map((r: any) => ({
      service: String(r.caller_service ?? "Unknown"),
      entityId: String(r.caller_id ?? ""),
      totalCalls: Number(r.total_calls ?? 0),
      avgFanOut: Number(r.avg_fan_out ?? 0),
    }));
  }, [summaryResult.data]);

  const sparklines = useMemo(() => {
    const records = sparklineResult.data?.records;
    if (!records || records.length < 2) return { chattyTraces: [] as number[], totalCalls: [] as number[] };
    return {
      chattyTraces: records.map((r: any) => Number(r.chatty_traces ?? 0)),
      totalCalls: records.map((r: any) => Number(r.total_calls ?? 0)),
    };
  }, [sparklineResult.data]);

  const prev = useMemo(() => {
    const rec = prevResult.data?.records?.[0] as any;
    if (!rec || !prevTf) return null;
    return {
      chattyTraces: Number(rec.chatty_traces ?? 0),
      chattyServices: Number(rec.chatty_services ?? 0),
      maxFanOut: Number(rec.max_fan_out ?? 0),
    };
  }, [prevResult.data, prevTf]);

  const columns = useMemo(() => [
    {
      id: "callCount",
      header: "Calls",
      accessor: "callCount",
      width: 80,
      cell: ({ value }: any) => (
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 13,
          background: value > 20 ? "rgba(255,131,43,0.15)" : "rgba(69,137,255,0.1)",
          color: value > 20 ? "#FF832B" : "#4589FF",
        }}>{value}</span>
      ),
    },
    {
      id: "callerService", header: "Caller Service", accessor: "callerService", width: 250,
      cell: ({ value, rowData }: any) => (
        <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?filter=dt.entity.service+%3D+${encodeURIComponent(rowData?.callerId || '')}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 13 }}>{value}</a>
      ),
    },
    { id: "distinctTargets", header: "Distinct Endpoints", accessor: "distinctTargets", width: 120 },
    {
      id: "traceId", header: "Trace ID", accessor: "traceId", width: 120,
      cell: ({ value }: any) => (
        value ? (
          <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?traceId=${value}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", fontSize: 12 }}>
            {value.slice(0, 8)}…
          </a>
        ) : <span>—</span>
      ),
    },
  ], []);

  const analyzeChat = useCallback((): AIInsightsData => {
    const insights: AIInsightsData["insights"] = [];
    const recs: AIInsightsData["recommendations"] = [];

    if (chattyData.length > 0) {
      const worstOffender = chattyData[0];
      insights.push({
        severity: worstOffender.callCount > 30 ? "critical" : "warning",
        icon: worstOffender.callCount > 30 ? "🔴" : "🟠",
        text: `Chattiest pattern: "${worstOffender.callerService}" makes ${worstOffender.callCount} downstream calls from a single parent span.`,
      });
    }

    if (summaryData.length > 0) {
      const totalChatty = summaryData.reduce((sum, s) => sum + s.totalCalls, 0);
      insights.push({
        severity: "info",
        icon: "📡",
        text: `${summaryData.length} services exhibit chatty behavior with ${totalChatty.toLocaleString()} total downstream calls in the window.`,
      });
    }

    const highFanOut = chattyData.filter(d => d.distinctTargets > 5);
    if (highFanOut.length > 0) {
      insights.push({
        severity: "warning",
        icon: "🕸️",
        text: `${highFanOut.length} spans call 5+ distinct downstream endpoints — candidates for aggregation/BFF patterns.`,
      });
    }

    recs.push({ impact: "high", text: "Introduce a Backend-for-Frontend (BFF) or aggregation layer to batch multiple fine-grained calls into a single coarse-grained request." });
    recs.push({ impact: "medium", text: "Implement response caching (TTL-based) for frequently-called downstream APIs to reduce redundant network round-trips." });
    recs.push({ impact: "low", text: "Consider GraphQL or gRPC streaming as alternatives to multiple REST calls for data that naturally groups together." });

    return {
      summary: chattyData.length > 0
        ? `Detected ${chattyData.length} chatty API patterns. Services are making excessive fine-grained calls instead of batch operations. Each unnecessary round-trip adds 1-10ms network latency plus serialization overhead.`
        : "No significant chatty API patterns detected in the current timeframe.",
      insights,
      recommendations: recs,
    };
  }, [chattyData, summaryData]);

  const { panel: aiPanel } = useAIInsights(analyzeChat, aiOpen, closeAi);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <ForecastProvider value={openForecast}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />

      <div className="pp-intro-banner">
        <p>
          <Strong>Chatty API Pattern:</Strong> Services making excessive fine-grained calls to downstream services
          instead of batch or aggregate calls. Each call adds network latency, serialization overhead, and
          connection pool pressure. Look for high fan-out from single parent spans.
        </p>
      </div>

      {aiPanel}

      {/* KPI cards */}
      <div className="pp-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard
          label="Chatty Traces"
          value={chattyData.length}
          rawValue={chattyData.length}
          prevRawValue={prev?.chattyTraces ?? null}
          sparkline={sparklines.chattyTraces}
          color={chattyData.length > 20 ? "#C21930" : "#FF832B"}
          isLoading={chattyResult.isLoading || sparklineResult.isLoading}
        />
        <KpiCard
          label="Chatty Services"
          value={summaryData.length}
          rawValue={summaryData.length}
          prevRawValue={prev?.chattyServices ?? null}
          sparkline={sparklines.chattyTraces}
          color="#4589FF"
          isLoading={summaryResult.isLoading}
        />
        <KpiCard
          label="Worst Fan-Out"
          value={chattyData.length > 0 ? `${chattyData[0].callCount} calls` : "—"}
          rawValue={chattyData.length > 0 ? chattyData[0].callCount : undefined}
          prevRawValue={prev?.maxFanOut ?? null}
          sparkline={sparklines.totalCalls}
          color="#C21930"
          isLoading={chattyResult.isLoading}
        />
      </div>

      {/* Summary by service */}
      <div className="pp-chart-card" style={{ marginBottom: 20 }}>
        <div className="pp-chart-title">Chatty Services Summary</div>
        {summaryResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : summaryData.length === 0 ? (
          <Text style={{ opacity: 0.5 }}>No chatty services detected</Text>
        ) : (
          <div>
            {summaryData.slice(0, 10).map((svc, i) => {
              const maxCalls = summaryData[0]?.totalCalls ?? 1;
              const pct = (svc.totalCalls / maxCalls) * 100;
              return (
                <div key={i} style={{ marginBottom: 8 }}>
                  <Flex justifyContent="space-between" style={{ marginBottom: 2 }}>
                    <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?filter=dt.entity.service+%3D+${encodeURIComponent(svc.entityId)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 12 }}>{svc.service}</a>
                    <Text style={{ fontSize: 12, fontWeight: 600 }}>{svc.totalCalls.toLocaleString()} calls</Text>
                  </Flex>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(128,128,128,0.1)" }}>
                    <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: "rgba(255,131,43,0.5)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail table */}
      <div className="pp-table-section">
        <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 12 }}>
          <div className="pp-table-title">Chatty Span Patterns (fan-out &gt; 5 calls)</div>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{chattyData.length} results</Text>
        </Flex>
        {chattyResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : (
          <DataTable data={chattyData} columns={columns} sortable resizable>
            <DataTable.Pagination defaultPageSize={25} />
          </DataTable>
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
