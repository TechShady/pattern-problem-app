import React, { useState, useMemo, useCallback } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Paragraph, Strong } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { AppHeader } from "../components/AppHeader";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { KpiCard, ForecastProvider } from "../components/KpiCard";
import { ForecastModal } from "../components/ForecastModal";
import { useTimeframe, getBinSize } from "../TimeframeContext";
import "../PatternProblems.css";
import type { AIInsightsData } from "../components/AIInsights";

let ENV_URL = "";
try { ENV_URL = getEnvironmentUrl(); } catch { /* dev fallback */ }

export function PatternOverview() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const [forecastState, setForecastState] = useState<{ label: string; sparkline: number[]; color?: string } | null>(null);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);
  const openForecast = useCallback((label: string, sparkline: number[], color?: string) => {
    setForecastState({ label, sparkline, color });
  }, []);

  const tf = `from: ${timeframe.from}`;

  // Compute previous period: e.g. now()-7d becomes prev from: now()-14d, to: now()-7d
  const prevTf = useMemo(() => {
    const match = timeframe.from.match(/now\(\)-(\d+)([hdm])/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    return `from: now()-${num * 2}${unit}, to: now()-${num}${unit}`;
  }, [timeframe.from]);

  // N+1 Spans count
  const nPlus1SpansQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| summarize total_spans = count()`;

  // Total DB queries
  const totalQueriesQuery = `fetch spans, ${tf}
| filter db.system != "null"
| summarize s = sum(aggregation.count)`;

  // Average queries per N+1 span
  const avgQueriesQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| summarize total_aggregation_count = sum(aggregation.count), total_spans = count()
| fieldsAdd average_count = total_aggregation_count / total_spans`;

  // Max queries per N+1 span
  const maxQueriesQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| summarize total_aggregation_count = max(aggregation.count)`;

  // Query reduction potential
  const reductionQuery = `fetch spans, ${tf}
| filter db.system != "null"
| summarize c=count(), s= sum(aggregation.count),
            c1=countif(aggregation.count > 1), s1=sum(if(aggregation.count > 1, aggregation.count))
| fieldsAdd queryReduction = ((toDouble(s1)-toDouble(c1)) / toDouble(s)) * 100,
            reducibleQueries = (toDouble(s1)-toDouble(c1))`;

  // N+1 services distribution
  const servicesQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| fields aggregation.count, service_name = entityName(dt.entity.service)
| summarize count=sum(aggregation.count), by:{service_name}
| sort count desc
| limit 10`;

  // N+1 databases distribution
  const databasesQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| fields db.system, aggregation.count
| summarize count=sum(aggregation.count), by:{db.system}
| sort count desc
| limit 10`;

  // Sparkline: N+1 span count bucketed over time
  const binSize = getBinSize(timeframe.from);
  const sparklineQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| summarize n1_count = count(), total_queries = sum(aggregation.count), avg_per_span = avg(toDouble(aggregation.count)), max_per_span = max(aggregation.count), by:{timeframe = bin(end_time, ${binSize})}
| sort timeframe`;

  // Previous period aggregate (for trend arrows)
  const prevQuery = prevTf ? `fetch spans, ${prevTf}
| filter db.system != "null"
| summarize total_spans_n1 = countif(aggregation.count > 1),
            total_queries = sum(aggregation.count),
            avg_queries_n1 = avg(if(aggregation.count > 1, toDouble(aggregation.count))),
            max_queries_n1 = max(if(aggregation.count > 1, aggregation.count)),
            c1=countif(aggregation.count > 1), s1=sum(if(aggregation.count > 1, aggregation.count)), s=sum(aggregation.count)
| fieldsAdd reducible = toDouble(s1) - toDouble(c1),
            reduction_pct = ((toDouble(s1)-toDouble(c1)) / toDouble(s)) * 100` : null;

  const nPlus1SpansResult = useDql({ query: nPlus1SpansQuery });
  const totalQueriesResult = useDql({ query: totalQueriesQuery });
  const avgQueriesResult = useDql({ query: avgQueriesQuery });
  const maxQueriesResult = useDql({ query: maxQueriesQuery });
  const reductionResult = useDql({ query: reductionQuery });
  const servicesResult = useDql({ query: servicesQuery });
  const databasesResult = useDql({ query: databasesQuery });
  const sparklineResult = useDql({ query: sparklineQuery });
  const prevResult = useDql({ query: prevQuery ?? "fetch spans, from: now()-1s | limit 0" });

  // Extract sparkline arrays from timeseries result
  const sparklines = useMemo(() => {
    const records = sparklineResult.data?.records;
    if (!records || records.length < 2) return { n1Count: [] as number[], totalQueries: [] as number[], avgPerSpan: [] as number[], maxPerSpan: [] as number[] };
    return {
      n1Count: records.map((r: any) => Number(r.n1_count ?? 0)),
      totalQueries: records.map((r: any) => Number(r.total_queries ?? 0)),
      avgPerSpan: records.map((r: any) => Number(r.avg_per_span ?? 0)),
      maxPerSpan: records.map((r: any) => Number(r.max_per_span ?? 0)),
    };
  }, [sparklineResult.data]);

  // Previous period values
  const prev = useMemo(() => {
    const rec = prevResult.data?.records?.[0] as any;
    if (!rec || !prevTf) return null;
    return {
      n1Spans: Number(rec.total_spans_n1 ?? 0),
      totalQueries: Number(rec.total_queries ?? 0),
      avgQueries: Number(rec.avg_queries_n1 ?? 0),
      maxQueries: Number(rec.max_queries_n1 ?? 0),
      reducible: Number(rec.reducible ?? 0),
      reductionPct: Number(rec.reduction_pct ?? 0),
    };
  }, [prevResult.data, prevTf]);

  const nPlus1Spans = useMemo(() => {
    const rec = nPlus1SpansResult.data?.records?.[0];
    return rec ? Number(rec.total_spans ?? 0) : null;
  }, [nPlus1SpansResult.data]);

  const totalQueries = useMemo(() => {
    const rec = totalQueriesResult.data?.records?.[0];
    return rec ? Number(rec.s ?? 0) : null;
  }, [totalQueriesResult.data]);

  const avgQueries = useMemo(() => {
    const rec = avgQueriesResult.data?.records?.[0];
    return rec ? Number(rec.average_count ?? 0) : null;
  }, [avgQueriesResult.data]);

  const maxQueries = useMemo(() => {
    const rec = maxQueriesResult.data?.records?.[0];
    return rec ? Number(rec.total_aggregation_count ?? 0) : null;
  }, [maxQueriesResult.data]);

  const reduction = useMemo(() => {
    const rec = reductionResult.data?.records?.[0];
    if (!rec) return null;
    return {
      percentage: Number(rec.queryReduction ?? 0),
      count: Number(rec.reducibleQueries ?? 0),
    };
  }, [reductionResult.data]);

  const servicesList = useMemo(() => {
    return (servicesResult.data?.records ?? []).map((r: any) => ({
      name: String(r.service_name ?? "Unknown"),
      count: Number(r.count ?? 0),
    }));
  }, [servicesResult.data]);

  const databasesList = useMemo(() => {
    return (databasesResult.data?.records ?? []).map((r: any) => ({
      name: String(r["db.system"] ?? "Unknown"),
      count: Number(r.count ?? 0),
    }));
  }, [databasesResult.data]);

  const isLoading = nPlus1SpansResult.isLoading || totalQueriesResult.isLoading;

  const analyzeOverview = useCallback((): AIInsightsData => {
    const insights: AIInsightsData["insights"] = [];
    const recs: AIInsightsData["recommendations"] = [];

    if (nPlus1Spans !== null && nPlus1Spans > 0) {
      insights.push({
        severity: nPlus1Spans > 100 ? "critical" : nPlus1Spans > 20 ? "warning" : "info",
        icon: nPlus1Spans > 100 ? "🔴" : nPlus1Spans > 20 ? "🟠" : "🔵",
        text: `Detected ${nPlus1Spans.toLocaleString()} spans with N+1 database query patterns in the selected timeframe.`,
      });
    }

    if (reduction && reduction.percentage > 0) {
      insights.push({
        severity: reduction.percentage > 50 ? "critical" : reduction.percentage > 25 ? "warning" : "info",
        icon: "📉",
        text: `${reduction.percentage.toFixed(1)}% of all database queries (${reduction.count.toLocaleString()} queries) could be eliminated by fixing N+1 patterns.`,
      });
    }

    if (maxQueries !== null && maxQueries > 50) {
      insights.push({
        severity: "critical",
        icon: "⚠️",
        text: `Worst offender: a single span triggers ${maxQueries.toLocaleString()} database queries. This is a prime candidate for batch optimization.`,
      });
    }

    if (avgQueries !== null && avgQueries > 10) {
      insights.push({
        severity: "warning",
        icon: "📊",
        text: `Average of ${avgQueries.toFixed(1)} queries per N+1 span. Each unnecessary round-trip adds ~1-5ms latency and connection pool pressure.`,
      });
    }

    if (servicesList.length > 3) {
      insights.push({
        severity: "info",
        icon: "🏗️",
        text: `N+1 patterns detected across ${servicesList.length} services. ${servicesList[0]?.name ?? "Unknown"} is the top offender with ${servicesList[0]?.count.toLocaleString() ?? 0} queries.`,
      });
    }

    // Recommendations
    if (reduction && reduction.percentage > 30) {
      recs.push({ impact: "high", text: "Implement batch fetching or DataLoader patterns in the top offending services to eliminate redundant database round-trips." });
    }
    if (maxQueries !== null && maxQueries > 100) {
      recs.push({ impact: "high", text: "Investigate the worst N+1 span — likely a loop fetching related entities. Convert to a JOIN or IN-clause query." });
    }
    if (servicesList.length > 5) {
      recs.push({ impact: "medium", text: "Consider adding ORM-level query monitoring (e.g., Hibernate query count assertions) in CI/CD to prevent N+1 regression." });
    }
    recs.push({ impact: "medium", text: "Enable second-level caching for frequently-accessed entities to reduce repeated database lookups." });
    recs.push({ impact: "low", text: "Review lazy-loading configurations in ORM mappings — switch to eager loading for predictable access patterns." });

    return {
      summary: nPlus1Spans !== null && nPlus1Spans > 0
        ? `Your services exhibit significant N+1 query patterns. ${reduction?.count.toLocaleString() ?? 0} unnecessary queries consume database resources that could be eliminated through batch fetching, caching, or query optimization. Estimated ${((reduction?.count ?? 0) * 3 / 1000).toFixed(1)}s of accumulated latency per request cycle.`
        : "No significant N+1 patterns detected in the current timeframe. Your services appear healthy with respect to database access patterns.",
      insights,
      recommendations: recs,
    };
  }, [nPlus1Spans, totalQueries, avgQueries, maxQueries, reduction, servicesList]);

  const { panel: aiPanel } = useAIInsights(analyzeOverview, aiOpen, closeAi);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <ForecastProvider value={openForecast}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />

      {/* Intro banner */}
      <div className="pp-intro-banner">
        <p>
          <Strong>Pattern Problems</Strong> identifies common anti-patterns in distributed architectures that cause
          unnecessary database load, network overhead, and increased latency. The N+1 Query Pattern is the most
          prevalent — instead of one batch query, your ORM or code issues N additional queries for related data,
          multiplying round-trips and database connections.
        </p>
      </div>

      {aiPanel}

      {/* KPI Cards */}
      {isLoading ? (
        <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
      ) : (
        <>
          <div className="pp-kpi-grid">
            <KpiCard
              label="N+1 Spans"
              value={nPlus1Spans?.toLocaleString() ?? "—"}
              rawValue={nPlus1Spans ?? undefined}
              prevRawValue={prev?.n1Spans ?? null}
              sparkline={sparklines.n1Count}
              color={(nPlus1Spans ?? 0) > 50 ? "#C21930" : (nPlus1Spans ?? 0) > 10 ? "#FF832B" : "#24A148"}
            />
            <KpiCard
              label="Total DB Queries"
              value={totalQueries?.toLocaleString() ?? "—"}
              rawValue={totalQueries ?? undefined}
              prevRawValue={prev?.totalQueries ?? null}
              sparkline={sparklines.totalQueries}
              color={(totalQueries ?? 0) > 10000 ? "#C21930" : "#FF832B"}
            />
            <KpiCard
              label="Avg Queries / N+1 Span"
              value={avgQueries?.toFixed(1) ?? "—"}
              rawValue={avgQueries ?? undefined}
              prevRawValue={prev?.avgQueries ?? null}
              sparkline={sparklines.avgPerSpan}
              color={(avgQueries ?? 0) > 20 ? "#C21930" : (avgQueries ?? 0) > 5 ? "#FF832B" : "#24A148"}
            />
            <KpiCard
              label="Max Queries (Worst Span)"
              value={maxQueries?.toLocaleString() ?? "—"}
              rawValue={maxQueries ?? undefined}
              prevRawValue={prev?.maxQueries ?? null}
              sparkline={sparklines.maxPerSpan}
              color="#C21930"
            />
            <KpiCard
              label="Query Reduction Potential"
              value={reduction ? `${reduction.percentage.toFixed(1)}%` : "—"}
              rawValue={reduction?.percentage ?? undefined}
              prevRawValue={prev?.reductionPct ?? null}
              sparkline={sparklines.n1Count.length > 0 ? sparklines.n1Count.map((n1: number, i: number) => sparklines.totalQueries[i] > 0 ? (n1 / sparklines.totalQueries[i]) * 100 : 0) : undefined}
              color={(reduction?.percentage ?? 0) > 30 ? "#C21930" : "#FF832B"}
            />
            <KpiCard
              label="Reducible Queries"
              value={reduction?.count.toLocaleString() ?? "—"}
              rawValue={reduction?.count ?? undefined}
              prevRawValue={prev?.reducible ?? null}
              sparkline={sparklines.totalQueries.length > 0 ? sparklines.totalQueries.map((v: number, i: number) => v - sparklines.n1Count[i]) : undefined}
              color={(reduction?.count ?? 0) > 1000 ? "#C21930" : "#FF832B"}
            />
          </div>

          {/* Services and Databases distribution */}
          <div className="pp-two-col">
            <div className="pp-chart-card">
              <div className="pp-chart-title">Top N+1 Services</div>
              {servicesList.length === 0 ? (
                <Text style={{ opacity: 0.5 }}>No data</Text>
              ) : (
                <div>
                  {servicesList.map((svc, i) => {
                    const maxCount = servicesList[0]?.count ?? 1;
                    const pct = (svc.count / maxCount) * 100;
                    return (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <Flex justifyContent="space-between" style={{ marginBottom: 2 }}>
                          <a href={`${ENV_URL}/ui/apps/dynatrace.services/explorer/services?perspective=performance&sort=entity%3Aascending&search=${encodeURIComponent(svc.name)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 12 }}>{svc.name}</a>
                          <Text style={{ fontSize: 12, fontWeight: 600 }}>{svc.count.toLocaleString()}</Text>
                        </Flex>
                        <div style={{ height: 6, borderRadius: 3, background: "rgba(128,128,128,0.1)" }}>
                          <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: "rgba(194,25,48,0.6)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="pp-chart-card">
              <div className="pp-chart-title">Top N+1 Databases</div>
              {databasesList.length === 0 ? (
                <Text style={{ opacity: 0.5 }}>No data</Text>
              ) : (
                <div>
                  {databasesList.map((db, i) => {
                    const maxCount = databasesList[0]?.count ?? 1;
                    const pct = (db.count / maxCount) * 100;
                    return (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <Flex justifyContent="space-between" style={{ marginBottom: 2 }}>
                          <Text style={{ fontSize: 12 }}>{db.name}</Text>
                          <Text style={{ fontSize: 12, fontWeight: 600 }}>{db.count.toLocaleString()}</Text>
                        </Flex>
                        <div style={{ height: 6, borderRadius: 3, background: "rgba(128,128,128,0.1)" }}>
                          <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: "rgba(255,131,43,0.6)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {forecastState && (
        <ForecastModal
          label={forecastState.label}
          sparkline={forecastState.sparkline}
          color={forecastState.color}
          onClose={() => setForecastState(null)}
          correlatedMetrics={[
            { label: "N+1 Span Count", data: sparklines.n1Count },
            { label: "Total Queries", data: sparklines.totalQueries },
            { label: "Avg Queries/Span", data: sparklines.avgPerSpan },
            { label: "Max Queries/Span", data: sparklines.maxPerSpan },
          ]}
        />
      )}
      </ForecastProvider>
    </AIInsightsContext.Provider>
  );
}
