import React, { useState, useMemo, useCallback } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Strong } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { AppHeader } from "../components/AppHeader";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { useTimeframe } from "../TimeframeContext";
import "../PatternProblems.css";
import type { AIInsightsData } from "../components/AIInsights";

export function NPlus1Trends() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);

  const tf = `from: ${timeframe.from}`;

  // Timeseries: N+1 query count over time
  const timeseriesQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| makeTimeseries \`N+1 Query Count\` = sum(aggregation.count), interval: auto`;

  // Scatter: high-count spans plotted over time
  const scatterQuery = `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| fields end_time, aggregation.count, service_name = entityName(dt.entity.service), db.system
| sort end_time asc
| limit 1000`;

  // Estimated annual projection (weekly * 52)
  const annualQuery = `fetch spans, from: now()-7d
| filter db.system != "null"
| summarize c=count(), s= sum(aggregation.count),
            c1=countif(aggregation.count > 1), s1=sum(if(aggregation.count > 1, aggregation.count))
| fieldsAdd queryReduction = (toDouble(s1)-toDouble(c1))*52`;

  const timeseriesResult = useDql({ query: timeseriesQuery });
  const scatterResult = useDql({ query: scatterQuery });
  const annualResult = useDql({ query: annualQuery });

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

  const { panel: aiPanel } = useAIInsights(analyzeTimeseries);

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />
      {aiPanel}

      {/* Annual estimate KPI */}
      <div className="pp-kpi-grid" style={{ marginBottom: 20 }}>
        <div className="pp-kpi-card">
          <div className="pp-kpi-card-label">Est. Unnecessary Queries / Year</div>
          <div className="pp-kpi-card-value critical">
            {annualEstimate !== null ? annualEstimate.toLocaleString() : "—"}
          </div>
        </div>
        <div className="pp-kpi-card">
          <div className="pp-kpi-card-label">High-Impact Spans (&gt;50 queries)</div>
          <div className="pp-kpi-card-value warning">
            {scatterData.filter(d => d.count > 50).length}
          </div>
        </div>
        <div className="pp-kpi-card">
          <div className="pp-kpi-card-label">Affected Services</div>
          <div className="pp-kpi-card-value info" style={{ color: "#4589FF" }}>
            {new Set(scatterData.map(d => d.service)).size}
          </div>
        </div>
      </div>

      {/* Scatter plot */}
      <div className="pp-chart-card" style={{ marginBottom: 20 }}>
        <div className="pp-chart-title">N+1 Spans Over Time (Scatter)</div>
        {scatterResult.isLoading ? (
          <div className="pp-loading"><ProgressBar style={{ width: 200 }} /></div>
        ) : scatterData.length === 0 ? (
          <Text style={{ opacity: 0.5, padding: 20 }}>No N+1 patterns detected in this timeframe</Text>
        ) : (
          <div style={{ position: "relative", height: 220, padding: "8px 0" }}>
            <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
              {/* Y-axis label */}
              <text x="10" y="15" fontSize="10" fill="rgba(128,128,128,0.6)">Queries</text>
              <text x="10" y="195" fontSize="10" fill="rgba(128,128,128,0.6)">0</text>
              {/* Grid lines */}
              <line x1="40" y1="20" x2="790" y2="20" stroke="rgba(128,128,128,0.1)" />
              <line x1="40" y1="60" x2="790" y2="60" stroke="rgba(128,128,128,0.1)" />
              <line x1="40" y1="100" x2="790" y2="100" stroke="rgba(128,128,128,0.1)" />
              <line x1="40" y1="140" x2="790" y2="140" stroke="rgba(128,128,128,0.1)" />
              <line x1="40" y1="180" x2="790" y2="180" stroke="rgba(128,128,128,0.1)" />
              {/* Dots */}
              {(() => {
                const minTime = Math.min(...scatterData.map(d => d.time));
                const maxTime = Math.max(...scatterData.map(d => d.time));
                const timeRange = maxTime - minTime || 1;
                return scatterData.map((d, i) => {
                  const x = 40 + ((d.time - minTime) / timeRange) * 750;
                  const y = 180 - (d.count / maxScatterCount) * 160;
                  const r = Math.min(2 + (d.count / maxScatterCount) * 4, 6);
                  const color = d.count > 100 ? "#C21930" : d.count > 50 ? "#FF832B" : d.count > 20 ? "#4589FF" : "#7cc7ff";
                  return <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={0.7} />;
                });
              })()}
            </svg>
            <Flex justifyContent="space-between" style={{ fontSize: 10, opacity: 0.4, padding: "0 40px" }}>
              <span>Oldest</span>
              <span>Most Recent</span>
            </Flex>
          </div>
        )}
        <Text style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>
          Each dot = one N+1 span. Size/color = query count (🔴 &gt;100, 🟠 &gt;50, 🔵 &lt;50). Clusters indicate systematic issues.
        </Text>
      </div>

      {/* Top spans by service */}
      <div className="pp-chart-card">
        <div className="pp-chart-title">Top Scatter Points by Service</div>
        {scatterData.slice(0, 15).map((d, i) => (
          <Flex key={i} justifyContent="space-between" alignItems="center" style={{ padding: "4px 0", borderBottom: "1px solid rgba(128,128,128,0.06)" }}>
            <Text style={{ fontSize: 12 }}>{d.service}</Text>
            <Flex alignItems="center" gap={8}>
              <Text style={{ fontSize: 11, opacity: 0.5 }}>{d.db}</Text>
              <span style={{
                padding: "2px 6px", borderRadius: 3, fontSize: 11, fontWeight: 700,
                background: d.count > 100 ? "rgba(194,25,48,0.12)" : "rgba(255,131,43,0.12)",
                color: d.count > 100 ? "#C21930" : "#FF832B",
              }}>{d.count}</span>
            </Flex>
          </Flex>
        ))}
      </div>
    </AIInsightsContext.Provider>
  );
}
