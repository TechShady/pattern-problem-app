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

export function CircularDependencies() {
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

  // Detect circular dependencies: traces where a service appears more than once
  // This indicates Service A -> B -> A or A -> B -> C -> A patterns
  const circularQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            service_id = toString(dt.entity.service),
            trace_id_str = toString(trace.id)
| summarize service_appearances = count(),
            by: { trace_id_str, service_name, service_id }
| filter service_appearances > 1
| summarize circular_traces = count(),
            avg_revisits = avg(toDouble(service_appearances)),
            max_revisits = max(service_appearances),
            by: { service_name, service_id }
| sort circular_traces desc
| limit 50`;

  // Service call pairs (A->B where B also calls A)
  const callPairsQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller = entityName(dt.entity.service),
            caller_id = toString(dt.entity.service),
            callee = span.name
| summarize call_count = count(), by: { caller, caller_id, callee }
| filter call_count > 3
| sort call_count desc
| limit 100`;

  const circularResult = useDql({ query: circularQuery });
  const callPairsResult = useDql({ query: callPairsQuery });

  // Sparkline: circular trace count over time
  const sparklineQuery = `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            trace_id_str = toString(trace.id)
| summarize service_appearances = count(), by: { trace_id_str, service_name, timeframe = bin(end_time, ${binSize}) }
| filter service_appearances > 1
| summarize circular_traces = count(), by: { timeframe }
| sort timeframe`;

  // Previous period aggregates
  const prevQuery = prevTf ? `fetch spans, ${prevTf}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            trace_id_str = toString(trace.id)
| summarize service_appearances = count(), by: { trace_id_str, service_name }
| filter service_appearances > 1
| summarize circular_traces = count(), affected_services = countDistinct(service_name), max_revisits = max(service_appearances)` : null;

  const sparklineResult = useDql({ query: sparklineQuery });
  const prevResult = useDql({ query: prevQuery ?? "fetch spans, from: now()-1s | limit 0" });

  const circularData = useMemo(() => {
    if (!circularResult.data?.records) return [];
    return circularResult.data.records.map((r: any) => ({
      serviceName: String(r.service_name ?? "Unknown"),
      entityId: String(r.service_id ?? ""),
      circularTraces: Number(r.circular_traces ?? 0),
      avgRevisits: Number(r.avg_revisits ?? 0),
      maxRevisits: Number(r.max_revisits ?? 0),
    }));
  }, [circularResult.data]);

  const callPairsData = useMemo(() => {
    if (!callPairsResult.data?.records) return [];
    return callPairsResult.data.records.map((r: any) => ({
      caller: String(r.caller ?? "Unknown"),
      callerId: String(r.caller_id ?? ""),
      callee: String(r.callee ?? "Unknown"),
      callCount: Number(r.call_count ?? 0),
    }));
  }, [callPairsResult.data]);

  // Detect potential circular pairs: A calls B and B calls A
  const circularPairs = useMemo(() => {
    const pairs: { serviceA: string; serviceAId: string; serviceB: string; serviceBId: string; aToBCount: number; bToACount: number }[] = [];
    const callMap = new Map<string, number>();
    const idMap = new Map<string, string>();
    callPairsData.forEach(p => {
      callMap.set(`${p.caller}→${p.callee}`, p.callCount);
      idMap.set(p.caller, p.callerId);
    });
    const seen = new Set<string>();
    callPairsData.forEach(p => {
      const reverse = `${p.callee}→${p.caller}`;
      const key = [p.caller, p.callee].sort().join("|");
      if (callMap.has(reverse) && !seen.has(key)) {
        seen.add(key);
        pairs.push({
          serviceA: p.caller,
          serviceAId: p.callerId,
          serviceB: p.callee,
          serviceBId: idMap.get(p.callee) ?? "",
          aToBCount: p.callCount,
          bToACount: callMap.get(reverse) ?? 0,
        });
      }
    });
    return pairs.sort((a, b) => (b.aToBCount + b.bToACount) - (a.aToBCount + a.bToACount));
  }, [callPairsData]);

  const sparklines = useMemo(() => {
    const records = sparklineResult.data?.records;
    if (!records || records.length < 2) return { circularTraces: [] as number[] };
    return {
      circularTraces: records.map((r: any) => Number(r.circular_traces ?? 0)),
    };
  }, [sparklineResult.data]);

  const prev = useMemo(() => {
    const rec = prevResult.data?.records?.[0] as any;
    if (!rec || !prevTf) return null;
    return {
      circularTraces: Number(rec.circular_traces ?? 0),
      affectedServices: Number(rec.affected_services ?? 0),
      maxRevisits: Number(rec.max_revisits ?? 0),
    };
  }, [prevResult.data, prevTf]);

  const columns = useMemo(() => [
    {
      id: "serviceName", header: "Service", accessor: "serviceName", width: 250,
      cell: ({ value, rowData }: any) => (
        <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?filter=dt.entity.service+%3D+${encodeURIComponent(rowData?.entityId || '')}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 13 }}>{value}</a>
      ),
    },
    {
      id: "circularTraces",
      header: "Circular Traces",
      accessor: "circularTraces",
      width: 120,
      cell: ({ value }: any) => (
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 13,
          background: value > 20 ? "rgba(165,110,255,0.15)" : "rgba(69,137,255,0.1)",
          color: value > 20 ? "#A56EFF" : "#4589FF",
        }}>{value}</span>
      ),
    },
    { id: "avgRevisits", header: "Avg Re-visits", accessor: "avgRevisits", width: 120,
      cell: ({ value }: any) => <span>{value?.toFixed(1)}</span> },
    { id: "maxRevisits", header: "Max Re-visits", accessor: "maxRevisits", width: 120 },
  ], []);

  const analyzeCircular = useCallback((): AIInsightsData => {
    const insights: AIInsightsData["insights"] = [];
    const recs: AIInsightsData["recommendations"] = [];

    if (circularData.length > 0) {
      insights.push({
        severity: "critical",
        icon: "🔄",
        text: `${circularData.length} services appear multiple times in the same trace — indicating circular or recursive call patterns.`,
      });

      const worst = circularData[0];
      insights.push({
        severity: "warning",
        icon: "⚠️",
        text: `"${worst.serviceName}" is revisited in ${worst.circularTraces} traces with up to ${worst.maxRevisits}x visits per trace.`,
      });
    }

    if (circularPairs.length > 0) {
      insights.push({
        severity: "critical",
        icon: "🔁",
        text: `Detected ${circularPairs.length} bidirectional call pairs (A↔B). "${circularPairs[0].serviceA}" and "${circularPairs[0].serviceB}" call each other (${circularPairs[0].aToBCount} + ${circularPairs[0].bToACount} calls).`,
      });
    }

    recs.push({ impact: "high", text: "Break circular dependencies by introducing an event bus or message queue between tightly-coupled services." });
    recs.push({ impact: "high", text: "Apply the Dependency Inversion Principle — extract shared logic into a third service that both can call without creating a cycle." });
    recs.push({ impact: "medium", text: "Add circuit breakers with cycle detection to prevent infinite recursion and cascading failures." });

    return {
      summary: circularData.length > 0
        ? `Detected circular dependency patterns in ${circularData.length} services. These create deadlock risks, make independent deployment impossible, and cause cascading failures.`
        : "No circular dependency patterns detected. Service call graphs appear acyclic.",
      insights,
      recommendations: recs,
    };
  }, [circularData, circularPairs]);

  const { panel: aiPanel } = useAIInsights(analyzeCircular, aiOpen, closeAi);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <ForecastProvider value={openForecast}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />

      <div className="pp-intro-banner">
        <p>
          <Strong>Circular Dependency Pattern:</Strong> Service A calls Service B which calls back to Service A
          (directly or via intermediate services). This creates deadlock risks, cascading failures, and makes
          independent deployment impossible. Detected by finding services that appear multiple times within
          the same distributed trace.
        </p>
      </div>

      {aiPanel}

      {/* KPI cards */}
      <div className="pp-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard
          label="Circular Services"
          value={circularData.length}
          rawValue={circularData.length}
          prevRawValue={prev?.affectedServices ?? null}
          sparkline={sparklines.circularTraces}
          color={circularData.length > 5 ? "#C21930" : "#A56EFF"}
          isLoading={circularResult.isLoading || sparklineResult.isLoading}
        />
        <KpiCard
          label="Bidirectional Pairs"
          value={circularPairs.length}
          rawValue={circularPairs.length}
          prevRawValue={prev ? prev.circularTraces : null}
          sparkline={sparklines.circularTraces}
          color="#FF832B"
          isLoading={callPairsResult.isLoading}
        />
        <KpiCard
          label="Worst Re-visits"
          value={circularData.length > 0 ? `${circularData[0].maxRevisits}x` : "—"}
          rawValue={circularData.length > 0 ? circularData[0].maxRevisits : undefined}
          prevRawValue={prev?.maxRevisits ?? null}
          sparkline={sparklines.circularTraces}
          color="#C21930"
          isLoading={circularResult.isLoading}
        />
      </div>

      {/* Bidirectional pairs */}
      {circularPairs.length > 0 && (
        <div className="pp-chart-card" style={{ marginBottom: 20 }}>
          <div className="pp-chart-title">Bidirectional Call Pairs (A ↔ B)</div>
          {circularPairs.slice(0, 10).map((pair, i) => (
            <div key={i} style={{ padding: "8px 12px", marginBottom: 6, borderRadius: 6, border: "1px solid rgba(165,110,255,0.15)", background: "rgba(165,110,255,0.03)" }}>
              <Flex justifyContent="space-between" alignItems="center">
                <Flex alignItems="center" gap={8}>
                  <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?filter=dt.entity.service+%3D+${encodeURIComponent(pair.serviceAId)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>{pair.serviceA}</a>
                  <span style={{ fontSize: 16, opacity: 0.4 }}>↔</span>
                  <a href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?filter=dt.entity.service+%3D+${encodeURIComponent(pair.serviceBId)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>{pair.serviceB}</a>
                </Flex>
                <Flex gap={12}>
                  <Text style={{ fontSize: 11, opacity: 0.6 }}>A→B: {pair.aToBCount}</Text>
                  <Text style={{ fontSize: 11, opacity: 0.6 }}>B→A: {pair.bToACount}</Text>
                </Flex>
              </Flex>
            </div>
          ))}
        </div>
      )}

      {/* Services with circular traces */}
      <div className="pp-table-section">
        <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 12 }}>
          <div className="pp-table-title">Services Appearing Multiple Times in Traces</div>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{circularData.length} services</Text>
        </Flex>
        {circularResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : (
          <DataTable data={circularData} columns={columns} sortable resizable>
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
