import React, { useState, useMemo, useCallback } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Strong, Paragraph } from "@dynatrace/strato-components/typography";
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

export function ImpactAnalysis() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
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

  // N+1 impact metrics
  const nPlus1ImpactQuery = `fetch spans, ${tf}
| filter db.system != "null"
| summarize total_queries = sum(aggregation.count),
            n1_queries = sum(if(aggregation.count > 1, aggregation.count)),
            n1_spans = countif(aggregation.count > 1),
            total_spans = count()
| fieldsAdd reducible = toDouble(n1_queries) - toDouble(n1_spans),
            reduction_pct = ((toDouble(n1_queries) - toDouble(n1_spans)) / toDouble(total_queries)) * 100`;

  // Service-level impact
  const serviceImpactQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| fieldsAdd service_name = entityName(dt.entity.service),
            duration_ms = toDouble(duration) / 1000000.0
| summarize n1_count = sum(aggregation.count),
            total_duration_ms = sum(duration_ms),
            avg_extra_duration_ms = avg(duration_ms),
            span_count = count(),
            by: { service_name }
| fieldsAdd estimated_wasted_ms = avg_extra_duration_ms * (toDouble(n1_count) - toDouble(span_count)),
            cost_per_week = (toDouble(n1_count) - toDouble(span_count)) * 0.000005
| sort estimated_wasted_ms desc
| limit 20`;

  const nPlus1Impact = useDql({ query: nPlus1ImpactQuery });
  const serviceImpact = useDql({ query: serviceImpactQuery });

  // Sparkline: N+1 impact over time
  const binSize = getBinSize(timeframe.from);
  const sparklineQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| summarize reducible_count = count(), total_wasted = sum(toDouble(duration) / 1000000.0), by:{timeframe = bin(end_time, ${binSize})}
| sort timeframe`;

  // Previous period impact
  const prevImpactQuery = prevTf ? `fetch spans, ${prevTf}
| filter db.system != "null"
| summarize total_queries = sum(aggregation.count),
            n1_queries = sum(if(aggregation.count > 1, aggregation.count)),
            n1_spans = countif(aggregation.count > 1),
            total_wasted_ms = sum(if(aggregation.count > 1, toDouble(duration) / 1000000.0))
| fieldsAdd reducible = toDouble(n1_queries) - toDouble(n1_spans),
            reduction_pct = ((toDouble(n1_queries) - toDouble(n1_spans)) / toDouble(total_queries)) * 100,
            cost_per_week = (toDouble(n1_queries) - toDouble(n1_spans)) * 0.000005` : null;

  const sparklineResult = useDql({ query: sparklineQuery });
  const prevImpactResult = useDql({ query: prevImpactQuery ?? "fetch spans, from: now()-1s | limit 0" });

  const sparklines = useMemo(() => {
    const records = sparklineResult.data?.records;
    if (!records || records.length < 2) return { reducible: [] as number[], wasted: [] as number[], reductionPct: [] as number[], cost: [] as number[] };
    const reducible = records.map((r: any) => Number(r.reducible_count ?? 0));
    const wasted = records.map((r: any) => Number(r.total_wasted ?? 0));
    const reductionPct = reducible.map((v: number) => v);
    const cost = reducible.map((v: number) => v * 0.000005 * 52);
    return { reducible, wasted, reductionPct, cost };
  }, [sparklineResult.data]);

  const prevImpact = useMemo(() => {
    const rec = prevImpactResult.data?.records?.[0] as any;
    if (!rec || !prevTf) return null;
    return {
      reducible: Number(rec.reducible ?? 0),
      reductionPct: Number(rec.reduction_pct ?? 0),
      wastedMs: Number(rec.total_wasted_ms ?? 0),
      costPerWeek: Number(rec.cost_per_week ?? 0),
    };
  }, [prevImpactResult.data, prevTf]);

  const impactKpis = useMemo(() => {
    const rec = nPlus1Impact.data?.records?.[0];
    if (!rec) return null;
    return {
      totalQueries: Number(rec.total_queries ?? 0),
      n1Queries: Number(rec.n1_queries ?? 0),
      n1Spans: Number(rec.n1_spans ?? 0),
      reducible: Number(rec.reducible ?? 0),
      reductionPct: Number(rec.reduction_pct ?? 0),
    };
  }, [nPlus1Impact.data]);

  const serviceData = useMemo(() => {
    if (!serviceImpact.data?.records) return [];
    return serviceImpact.data.records.map((r: any) => ({
      service: String(r.service_name ?? "Unknown"),
      n1Count: Number(r.n1_count ?? 0),
      totalDurationMs: Number(r.total_duration_ms ?? 0),
      avgExtraDuration: Number(r.avg_extra_duration_ms ?? 0),
      spanCount: Number(r.span_count ?? 0),
      wastedMs: Number(r.estimated_wasted_ms ?? 0),
      costPerWeek: Number(r.cost_per_week ?? 0),
    }));
  }, [serviceImpact.data]);

  const totalWastedMs = useMemo(() => serviceData.reduce((s, d) => s + d.wastedMs, 0), [serviceData]);
  const totalCostPerWeek = useMemo(() => serviceData.reduce((s, d) => s + d.costPerWeek, 0), [serviceData]);

  const analyzeImpact = useCallback((): AIInsightsData => {
    const insights: AIInsightsData["insights"] = [];
    const recs: AIInsightsData["recommendations"] = [];

    if (impactKpis) {
      insights.push({
        severity: impactKpis.reductionPct > 30 ? "critical" : "warning",
        icon: "💰",
        text: `${impactKpis.reductionPct.toFixed(1)}% of database queries (${impactKpis.reducible.toLocaleString()} queries) are redundant and could be eliminated, saving DB connections and compute.`,
      });
    }

    if (totalWastedMs > 0) {
      const wastedSeconds = totalWastedMs / 1000;
      insights.push({
        severity: wastedSeconds > 60 ? "critical" : "warning",
        icon: "⏱️",
        text: `Estimated ${wastedSeconds.toFixed(1)}s of cumulative wasted processing time from N+1 patterns in this window. That's latency added to real user requests.`,
      });
    }

    if (totalCostPerWeek > 0) {
      insights.push({
        severity: "info",
        icon: "📊",
        text: `Estimated infrastructure cost from redundant queries: ~$${totalCostPerWeek.toFixed(2)}/week ($${(totalCostPerWeek * 52).toFixed(2)}/year) based on average cloud DB pricing.`,
      });
    }

    if (serviceData.length > 0) {
      insights.push({
        severity: "warning",
        icon: "🎯",
        text: `Top impact service: "${serviceData[0].service}" wastes ${(serviceData[0].wastedMs / 1000).toFixed(1)}s of processing time. Fixing this single service would have the highest ROI.`,
      });
    }

    recs.push({ impact: "high", text: "Prioritize fixing the top 3 services by wasted time — they account for the majority of business impact." });
    recs.push({ impact: "high", text: "Calculate the TCO: include DB connection pool saturation, increased cloud auto-scaling, and user-facing latency impact." });
    recs.push({ impact: "medium", text: "Set up SLO-based alerting: when N+1 query count exceeds a threshold relative to request volume, trigger investigation." });
    recs.push({ impact: "medium", text: "Add pattern problem metrics to your deployment scorecards — block releases that introduce new N+1 patterns." });

    return {
      summary: impactKpis
        ? `Business impact assessment: ${impactKpis.reducible.toLocaleString()} unnecessary queries costing ~$${(totalCostPerWeek * 52).toFixed(2)}/year in infrastructure and adding ${(totalWastedMs / 1000).toFixed(1)}s of cumulative latency. Fixing the top 3 services would eliminate ~70% of the waste.`
        : "Loading impact data...",
      insights,
      recommendations: recs,
    };
  }, [impactKpis, serviceData, totalWastedMs, totalCostPerWeek]);

  const { panel: aiPanel } = useAIInsights(analyzeImpact, aiOpen, closeAi);

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
          <Strong>Impact Analysis</Strong> estimates the real business cost of pattern problems: unnecessary cloud spend,
          increased latency affecting user experience, database connection pool exhaustion, and scalability ceilings.
          Use this data to prioritize which patterns to fix first for maximum ROI.
        </p>
      </div>

      {aiPanel}

      {nPlus1Impact.isLoading ? (
        <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
      ) : (
        <>
          {/* Impact KPIs */}
          <div className="pp-kpi-grid" style={{ marginBottom: 24 }}>
            <KpiCard
              label="Reducible Queries"
              value={impactKpis?.reducible.toLocaleString() ?? "—"}
              rawValue={impactKpis?.reducible}
              prevRawValue={prevImpact?.reducible ?? null}
              sparkline={sparklines.reducible}
              color="#C21930"
            />
            <KpiCard
              label="Query Reduction %"
              value={impactKpis ? `${impactKpis.reductionPct.toFixed(1)}%` : "—"}
              rawValue={impactKpis?.reductionPct}
              prevRawValue={prevImpact?.reductionPct ?? null}
              sparkline={sparklines.reductionPct}
              color="#FF832B"
            />
            <KpiCard
              label="Wasted Processing Time"
              value={totalWastedMs > 0 ? `${(totalWastedMs / 1000).toFixed(1)}s` : "—"}
              rawValue={totalWastedMs > 0 ? totalWastedMs / 1000 : undefined}
              prevRawValue={prevImpact ? prevImpact.wastedMs / 1000 : null}
              sparkline={sparklines.wasted}
              color="#C21930"
            />
            <KpiCard
              label="Est. Cost / Year"
              value={totalCostPerWeek > 0 ? `$${(totalCostPerWeek * 52).toFixed(2)}` : "—"}
              rawValue={totalCostPerWeek > 0 ? totalCostPerWeek * 52 : undefined}
              prevRawValue={prevImpact ? prevImpact.costPerWeek * 52 : null}
              sparkline={sparklines.cost}
              color="#FF832B"
            />
          </div>

          {/* Service impact breakdown */}
          <div className="pp-chart-card">
            <div className="pp-chart-title">Service Impact Breakdown (sorted by wasted time)</div>
            {serviceImpact.isLoading ? (
              <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
            ) : serviceData.length === 0 ? (
              <Text style={{ opacity: 0.5 }}>No impact data</Text>
            ) : (
              <div>
                {serviceData.map((svc, i) => {
                  const maxWasted = serviceData[0]?.wastedMs ?? 1;
                  const pct = (svc.wastedMs / maxWasted) * 100;
                  return (
                    <div key={i} style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.08)" }}>
                      <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 4 }}>
                        <a href={`${ENV_URL}/ui/apps/dynatrace.services/explorer/services?perspective=performance&sort=entity%3Aascending&search=${encodeURIComponent(svc.service)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4589FF", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>{svc.service}</a>
                        <Flex gap={16}>
                          <Text style={{ fontSize: 11, opacity: 0.6 }}>{svc.n1Count.toLocaleString()} queries</Text>
                          <Text style={{ fontSize: 11, opacity: 0.6 }}>{svc.spanCount} spans</Text>
                          <Text style={{ fontSize: 11, fontWeight: 700, color: "#C21930" }}>{(svc.wastedMs / 1000).toFixed(2)}s wasted</Text>
                          <Text style={{ fontSize: 11, opacity: 0.6 }}>${svc.costPerWeek.toFixed(4)}/wk</Text>
                        </Flex>
                      </Flex>
                      <div style={{ height: 6, borderRadius: 3, background: "rgba(128,128,128,0.1)" }}>
                        <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: "rgba(194,25,48,0.5)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
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
