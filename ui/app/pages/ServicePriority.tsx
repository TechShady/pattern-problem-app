import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { AppHeader } from "../components/AppHeader";
import { useTimeframe } from "../TimeframeContext";
import { loadCostSettings, CostSettings, COST_SETTINGS_EVENT } from "../CostSettings";
import type { AIInsightsData } from "../components/AIInsights";
import "../PatternProblems.css";

interface ServiceRow {
  name: string;
  n1Reducible: number;
  chattyCalls: number;
  circularTraces: number;
  varianceRatio: number;
  patternCount: number;
  score: number;
  fixHours: number;
  fixCost: number;
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString();
}

const noopInsights = (): AIInsightsData => ({
  summary: "Service Priority ranks services by combined anti-pattern impact.",
  insights: [],
  recommendations: [],
});

export function ServicePriority() {
  const { timeframe } = useTimeframe();
  const [aiOpen, setAiOpen] = useState(false);
  const closeAi = useCallback(() => setAiOpen(false), []);
  const aiCtx = useMemo(() => ({ open: aiOpen, close: closeAi }), [aiOpen, closeAi]);
  const [costSettings, setCostSettings] = useState<CostSettings>(loadCostSettings());

  useEffect(() => {
    const handler = () => setCostSettings(loadCostSettings());
    window.addEventListener(COST_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(COST_SETTINGS_EVENT, handler);
  }, []);

  const tf = `from: ${timeframe.from}`;

  const n1Result = useDql({
    query: `fetch spans, ${tf}
| filter db.system != "null" and aggregation.count > 1
| filterOut contains(db.query.text, "INSERT")
| fields svc = dt.service.name, agg = toDouble(aggregation.count)
| summarize n1_queries = sum(agg), n1_spans = count(), by: {svc}
| fieldsAdd reducible = n1_queries - toDouble(n1_spans)
| filter reducible > 0
| sort reducible desc
| limit 25`,
  });

  const chattyResult = useDql({
    query: `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd svc = dt.service.name
| summarize total_calls = count(), by: {svc}
| filter total_calls > 50
| sort total_calls desc
| limit 25`,
  });

  const circularResult = useDql({
    query: `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd svc = dt.service.name, tid = toString(trace.id)
| summarize appearances = count(), by: {tid, svc}
| filter appearances > 1
| summarize circular_traces = count(), by: {svc}
| sort circular_traces desc
| limit 25`,
  });

  const slowResult = useDql({
    query: `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd svc = dt.service.name, dur_ms = toDouble(duration) / 1000000.0
| summarize avg_dur = avg(dur_ms), p99_dur = percentile(dur_ms, 99), total_spans = count(), by: {svc}
| fieldsAdd variance_ratio = p99_dur / avg_dur
| filter variance_ratio > 5 and total_spans > 10
| sort variance_ratio desc
| limit 25`,
  });

  const isLoading =
    n1Result.isLoading || chattyResult.isLoading || circularResult.isLoading || slowResult.isLoading;

  const services = useMemo<ServiceRow[]>(() => {
    const map = new Map<string, { n1: number; chatty: number; circular: number; variance: number }>();

    const ensure = (name: string) => {
      if (!name || name === "null" || name === "undefined") return null;
      if (!map.has(name)) map.set(name, { n1: 0, chatty: 0, circular: 0, variance: 0 });
      return map.get(name)!;
    };

    (n1Result.data?.records ?? []).forEach((r: any) => {
      const e = ensure(String(r.svc ?? ""));
      if (e) e.n1 = Number(r.reducible ?? 0);
    });
    (chattyResult.data?.records ?? []).forEach((r: any) => {
      const e = ensure(String(r.svc ?? ""));
      if (e) e.chatty = Number(r.total_calls ?? 0);
    });
    (circularResult.data?.records ?? []).forEach((r: any) => {
      const e = ensure(String(r.svc ?? ""));
      if (e) e.circular = Number(r.circular_traces ?? 0);
    });
    (slowResult.data?.records ?? []).forEach((r: any) => {
      const e = ensure(String(r.svc ?? ""));
      if (e) e.variance = Number(r.variance_ratio ?? 0);
    });

    const entries = Array.from(map.entries());
    const maxN1 = Math.max(1, ...entries.map(([, v]) => v.n1));
    const maxChatty = Math.max(1, ...entries.map(([, v]) => v.chatty));
    const maxVariance = Math.max(1, ...entries.map(([, v]) => v.variance));
    const maxCircular = Math.max(1, ...entries.map(([, v]) => v.circular));

    return entries
      .map(([name, v]) => {
        const patternCount =
          (v.n1 > 0 ? 1 : 0) + (v.chatty > 0 ? 1 : 0) + (v.variance > 0 ? 1 : 0) + (v.circular > 0 ? 1 : 0);

        const score = Math.min(100, Math.round(
          (v.n1 > 0 ? (v.n1 / maxN1) * 35 : 0) +
          (v.chatty > 0 ? (v.chatty / maxChatty) * 25 : 0) +
          (v.variance > 0 ? (v.variance / maxVariance) * 25 : 0) +
          (v.circular > 0 ? (v.circular / maxCircular) * 15 : 0) +
          (patternCount - 1) * 5
        ));

        const fixHours =
          (v.n1 > 0 ? costSettings.devHoursPerN1Fix : 0) +
          (v.chatty > 0 ? costSettings.devHoursPerChattyFix : 0) +
          (v.variance > 0 ? costSettings.devHoursPerSlowFix : 0) +
          (v.circular > 0 ? costSettings.devHoursPerCircularFix : 0);

        return {
          name,
          n1Reducible: v.n1,
          chattyCalls: v.chatty,
          circularTraces: v.circular,
          varianceRatio: v.variance,
          patternCount,
          score,
          fixHours,
          fixCost: fixHours * costSettings.engineerHourlyRate,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [n1Result.data, chattyResult.data, circularResult.data, slowResult.data, costSettings]);

  const multiPatternCount = services.filter(s => s.patternCount >= 2).length;
  const totalFixCost = services.reduce((s, r) => s + r.fixCost, 0);
  const { panel: aiPanel } = useAIInsights(noopInsights, aiOpen, closeAi);

  const scoreColor = (score: number) =>
    score >= 80 ? "#C21930" : score >= 60 ? "#E07020" : score >= 40 ? "#E8A000" : "#24A148";

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />
      {aiPanel}

      <div style={{ padding: "0 4px" }}>
        <div className="pp-kpi-grid" style={{ marginBottom: 20 }}>
          <div className="pp-kpi-card">
            <div className="pp-kpi-label">Affected Services</div>
            <div className="pp-kpi-value">{isLoading ? "…" : fmtNum(services.length)}</div>
            <div className="pp-kpi-sub">with ≥1 anti-pattern</div>
          </div>
          <div className="pp-kpi-card">
            <div className="pp-kpi-label">Multi-Pattern Services</div>
            <div className="pp-kpi-value">{isLoading ? "…" : fmtNum(multiPatternCount)}</div>
            <div className="pp-kpi-sub">affected by ≥2 patterns</div>
          </div>
          <div className="pp-kpi-card">
            <div className="pp-kpi-label">Top Priority Service</div>
            <div className="pp-kpi-value" style={{ fontSize: 16, wordBreak: "break-all" }}>
              {isLoading ? "…" : (services[0]?.name ?? "—")}
            </div>
            <div className="pp-kpi-sub">highest combined impact</div>
          </div>
          <div className="pp-kpi-card">
            <div className="pp-kpi-label">Est. Total Fix Investment</div>
            <div className="pp-kpi-value">{isLoading ? "…" : `$${fmtNum(totalFixCost)}`}</div>
            <div className="pp-kpi-sub">all affected services</div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 48, opacity: 0.5 }}>Loading service data…</div>
        ) : services.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, opacity: 0.5 }}>
            No anti-pattern data found for the selected timeframe.
          </div>
        ) : (
          <div className="pp-priority-table-wrap">
            <table className="pp-priority-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Service</th>
                  <th>Patterns</th>
                  <th>N+1 Reducible</th>
                  <th>Chatty Calls</th>
                  <th>Var. Ratio</th>
                  <th>Circ. Traces</th>
                  <th style={{ width: 130 }}>Priority Score</th>
                  <th>Est. Fix</th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc, i) => (
                  <tr key={svc.name} className={i === 0 ? "pp-priority-row-top" : ""}>
                    <td className="pp-priority-rank">{i + 1}</td>
                    <td className="pp-priority-service">{svc.name}</td>
                    <td>
                      <div className="pp-badge-group">
                        {svc.n1Reducible > 0 && <span className="pp-badge pp-badge-n1">N+1</span>}
                        {svc.chattyCalls > 0 && <span className="pp-badge pp-badge-chatty">Chatty</span>}
                        {svc.varianceRatio > 0 && <span className="pp-badge pp-badge-slow">Slow</span>}
                        {svc.circularTraces > 0 && <span className="pp-badge pp-badge-circular">Circ.</span>}
                      </div>
                    </td>
                    <td>{svc.n1Reducible > 0 ? fmtNum(svc.n1Reducible) : <span className="pp-priority-none">—</span>}</td>
                    <td>{svc.chattyCalls > 0 ? fmtNum(svc.chattyCalls) : <span className="pp-priority-none">—</span>}</td>
                    <td>
                      {svc.varianceRatio > 0
                        ? `${svc.varianceRatio.toFixed(1)}×`
                        : <span className="pp-priority-none">—</span>}
                    </td>
                    <td>
                      {svc.circularTraces > 0
                        ? fmtNum(svc.circularTraces)
                        : <span className="pp-priority-none">—</span>}
                    </td>
                    <td>
                      <div className="pp-score-cell">
                        <div className="pp-score-bar">
                          <div
                            className="pp-score-fill"
                            style={{ width: `${svc.score}%`, background: scoreColor(svc.score) }}
                          />
                        </div>
                        <span className="pp-score-num" style={{ color: scoreColor(svc.score) }}>
                          {svc.score}
                        </span>
                      </div>
                    </td>
                    <td className="pp-priority-fix">
                      <span className="pp-fix-hours">{svc.fixHours}h</span>
                      <span className="pp-fix-cost">${fmtNum(svc.fixCost)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pp-priority-footer">
              Score = weighted blend: N+1 reducible queries (35%), chatty call volume (25%), latency variance ratio (25%),
              circular trace count (15%). Multi-pattern services receive an additional bonus. Fix investment is based on
              hourly rate × estimated hours per pattern type — adjust in Settings.
            </div>
          </div>
        )}
      </div>
    </AIInsightsContext.Provider>
  );
}
