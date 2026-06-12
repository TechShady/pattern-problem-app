import React, { useState, useMemo, useCallback } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Strong } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { AppHeader } from "../components/AppHeader";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { useTimeframe } from "../TimeframeContext";
import "../PatternProblems.css";
import type { AIInsightsData } from "../components/AIInsights";

let ENV_URL = "";
try { ENV_URL = getEnvironmentUrl(); } catch { /* dev fallback */ }

export function NPlus1Details() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);

  const tf = `from: ${timeframe.from}`;

  const topSpansQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 10
| fieldsAdd trace_id = toString(trace.id), span_id = toString(span.id)
| fields \`N+1 Count\` = aggregation.count,
         \`Query\` = if(isNotNull(db.query.text), db.query.text, else: if(isNotNull(db.operation.name), db.operation.name, else: code.function)),
         trace.id,
         span.id,
         span.name,
         \`Service Name\` = entityName(dt.entity.service),
         \`Endpoint\` = if(isnull(endpoint.name), span.name, else: endpoint.name),
         \`DB\` = db.system,
         dt.entity.service
| sort \`N+1 Count\` desc
| limit 200`;

  const topSpansResult = useDql({ query: topSpansQuery });

  const tableData = useMemo(() => {
    if (!topSpansResult.data?.records) return [];
    return topSpansResult.data.records.map((r: any) => ({
      count: Number(r["N+1 Count"] ?? 0),
      query: String(r["Query"] ?? ""),
      serviceName: String(r["Service Name"] ?? "Unknown"),
      endpoint: String(r["Endpoint"] ?? ""),
      db: String(r["DB"] ?? ""),
      traceId: String(r["trace.id"] ?? ""),
      spanId: String(r["span.id"] ?? ""),
      entityId: String(r["dt.entity.service"] ?? ""),
    }));
  }, [topSpansResult.data]);

  const columns = useMemo(() => [
    {
      id: "count",
      header: "N+1 Count",
      accessor: "count",
      width: 100,
      cell: ({ value }: any) => (
        <span style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 4,
          background: value > 100 ? "rgba(194,25,48,0.15)" : value > 30 ? "rgba(255,131,43,0.15)" : "rgba(69,137,255,0.1)",
          color: value > 100 ? "#C21930" : value > 30 ? "#FF832B" : "#4589FF",
          fontWeight: 700,
          fontSize: 13,
        }}>{value?.toLocaleString()}</span>
      ),
    },
    { id: "serviceName", header: "Service", accessor: "serviceName", width: 180,
      cell: ({ value }: any) => (
        <a href={`${ENV_URL}/ui/apps/dynatrace.services/explorer/services?perspective=performance&sort=entity%3Aascending&search=${encodeURIComponent(value)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 13 }}>{value}</a>
      ),
    },
    { id: "endpoint", header: "Endpoint", accessor: "endpoint", width: 200 },
    { id: "query", header: "Query", accessor: "query", width: 400 },
    { id: "db", header: "Database", accessor: "db", width: 100 },
    {
      id: "traceId",
      header: "Trace",
      accessor: "traceId",
      width: 80,
      cell: ({ value }: any) => (
        value ? (
          <a
            href={`${ENV_URL}/ui/apps/dynatrace.distributedtracing/explorer?traceId=${value}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#4589FF", fontSize: 12 }}
          >
            View
          </a>
        ) : <span>—</span>
      ),
    },
  ], []);

  const analyzeDetails = useCallback((): AIInsightsData => {
    const insights: AIInsightsData["insights"] = [];
    const recs: AIInsightsData["recommendations"] = [];

    if (tableData.length > 0) {
      const top = tableData[0];
      insights.push({
        severity: "critical",
        icon: "🔴",
        text: `Worst N+1 offender: "${top.serviceName}" endpoint "${top.endpoint}" with ${top.count} queries to ${top.db}.`,
      });

      // Service concentration
      const serviceCounts = new Map<string, number>();
      tableData.forEach(row => {
        serviceCounts.set(row.serviceName, (serviceCounts.get(row.serviceName) ?? 0) + row.count);
      });
      const topService = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topService) {
        insights.push({
          severity: "warning",
          icon: "🏗️",
          text: `Service "${topService[0]}" accounts for ${topService[1].toLocaleString()} N+1 queries across multiple endpoints.`,
        });
      }

      // DB concentration
      const dbCounts = new Map<string, number>();
      tableData.forEach(row => {
        dbCounts.set(row.db, (dbCounts.get(row.db) ?? 0) + row.count);
      });
      const topDb = [...dbCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topDb) {
        insights.push({
          severity: "info",
          icon: "💾",
          text: `Database "${topDb[0]}" receives ${topDb[1].toLocaleString()} redundant queries — highest impact for optimization.`,
        });
      }

      recs.push({ impact: "high", text: `Focus on "${top.serviceName}" — implement DataLoader/batch fetching for the ${top.endpoint} endpoint.` });
      recs.push({ impact: "medium", text: "Add query count assertions to integration tests to prevent N+1 regressions." });
      recs.push({ impact: "low", text: "Consider implementing a query result cache (Redis/Memcached) for frequently-accessed entities." });
    }

    return {
      summary: tableData.length > 0
        ? `Found ${tableData.length} N+1 patterns exceeding threshold. Total redundant queries: ${tableData.reduce((sum, r) => sum + r.count, 0).toLocaleString()}. Top service: ${tableData[0]?.serviceName ?? "Unknown"}.`
        : "No N+1 patterns found above the threshold in the current timeframe.",
      insights,
      recommendations: recs,
    };
  }, [tableData]);

  const { panel: aiPanel } = useAIInsights(analyzeDetails, aiOpen, closeAi);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />
      {aiPanel}

      <div className="pp-table-section">
        <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 12 }}>
          <div className="pp-table-title">Top N+1 Spans (aggregation count &gt; 10)</div>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{tableData.length} results</Text>
        </Flex>
        {topSpansResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : (
          <DataTable data={tableData} columns={columns} sortable resizable>
            <DataTable.Pagination defaultPageSize={25} />
          </DataTable>
        )}
      </div>
    </AIInsightsContext.Provider>
  );
}
