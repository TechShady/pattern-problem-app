import React, { useState, useMemo, useCallback } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text, Strong } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { AppHeader } from "../components/AppHeader";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { useTimeframe } from "../TimeframeContext";
import "../PatternProblems.css";
import type { AIInsightsData } from "../components/AIInsights";

export function ChattyAPIs() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);

  const tf = `from: "${timeframe.from}", to: "${timeframe.to}"`;

  // Chatty APIs: parent spans with many child calls to downstream services
  // We look for spans that have high fan-out (many child spans to other services)
  const chattyQuery = `fetch spans, timeframe: { ${tf} }
| filter isNotNull(dt.entity.service) and kind == "CLIENT"
| fieldsAdd caller_service = entityName(dt.entity.service),
            parent_span = toString(parent_span.id)
| summarize call_count = count(),
            distinct_targets = countDistinctExact(span.name),
            by: { caller_service, parent_span }
| filter call_count > 5
| sort call_count desc
| limit 100`;

  // Service-level chatty summary
  const chattySummaryQuery = `fetch spans, timeframe: { ${tf} }
| filter isNotNull(dt.entity.service) and kind == "CLIENT"
| fieldsAdd caller_service = entityName(dt.entity.service)
| summarize total_calls = count(),
            avg_fan_out = avg(toDouble(aggregation.count)),
            by: { caller_service }
| filter total_calls > 50
| sort total_calls desc
| limit 20`;

  const chattyResult = useDql({ query: chattyQuery });
  const summaryResult = useDql({ query: chattySummaryQuery });

  const chattyData = useMemo(() => {
    if (!chattyResult.data?.records) return [];
    return chattyResult.data.records.map((r: any) => ({
      callerService: String(r.caller_service ?? "Unknown"),
      parentSpan: String(r.parent_span ?? ""),
      callCount: Number(r.call_count ?? 0),
      distinctTargets: Number(r.distinct_targets ?? 0),
    }));
  }, [chattyResult.data]);

  const summaryData = useMemo(() => {
    if (!summaryResult.data?.records) return [];
    return summaryResult.data.records.map((r: any) => ({
      service: String(r.caller_service ?? "Unknown"),
      totalCalls: Number(r.total_calls ?? 0),
      avgFanOut: Number(r.avg_fan_out ?? 0),
    }));
  }, [summaryResult.data]);

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
    { id: "callerService", header: "Caller Service", accessor: "callerService", width: 250 },
    { id: "distinctTargets", header: "Distinct Targets", accessor: "distinctTargets", width: 120 },
    { id: "parentSpan", header: "Parent Span ID", accessor: "parentSpan", width: 250 },
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

  const { panel: aiPanel } = useAIInsights(analyzeChat);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />

      <div className="pp-intro-banner">
        <p>
          <Strong>Chatty API Pattern:</Strong> Services making excessive fine-grained calls to downstream services
          instead of batch or aggregate calls. Each call adds network latency, serialization overhead, and
          connection pool pressure. Look for high fan-out from single parent spans.
        </p>
      </div>

      {aiPanel}

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
                    <Text style={{ fontSize: 12 }}>{svc.service}</Text>
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
    </AIInsightsContext.Provider>
  );
}
