import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Button } from "@dynatrace/strato-components/buttons";
import { AIInsightsContext, useAIInsights } from "../components/AIInsights";
import { AppHeader } from "../components/AppHeader";
import { useTimeframe } from "../TimeframeContext";
import { loadCostSettings, CostSettings, COST_SETTINGS_EVENT, getAnnualMultiplier, fmt } from "../CostSettings";
import type { AIInsightsData } from "../components/AIInsights";
import "../PatternProblems.css";

function fmtNum(n: number) {
  return Math.round(n).toLocaleString();
}

interface ExecData {
  n1Cost: number; n1Services: number; n1Investment: number;
  chattyCost: number; chattyServices: number; chattyInvestment: number;
  circularCost: number; circularServices: number; circularInvestment: number;
  slowCost: number; slowServices: number; slowInvestment: number;
}

function generatePdfHtml(data: ExecData, settings: CostSettings, timeframeLabel: string): string {
  const total = data.n1Cost + data.chattyCost + data.circularCost + data.slowCost;
  const totalInv = data.n1Investment + data.chattyInvestment + data.circularInvestment + data.slowInvestment;
  const payback = (cost: number, inv: number) =>
    cost > 0 && inv > 0 ? `${Math.ceil(inv / cost * 365)} days` : "—";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pattern Problems — Executive Summary</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 48px; max-width: 960px; }
  h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #888; margin-bottom: 36px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #666; margin: 32px 0 14px; padding-bottom: 6px; border-bottom: 1px solid #e8e8e8; }
  .cost-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
  .cost-card { border: 1px solid #e0e0e0; border-radius: 10px; padding: 16px 18px; }
  .cost-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .cost-value { font-size: 26px; font-weight: 700; color: #1a7f37; }
  .cost-sub { font-size: 11px; color: #aaa; margin-top: 5px; }
  .total-bar { display: flex; justify-content: space-between; align-items: center; background: #f0faf4; border: 1px solid #2da44e; border-radius: 10px; padding: 18px 24px; }
  .total-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #333; }
  .total-value { font-size: 32px; font-weight: 800; color: #1a7f37; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 9px 12px; border-bottom: 2px solid #ddd; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #777; }
  td { padding: 11px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  tr.total-row td { font-weight: 700; border-top: 2px solid #ddd; border-bottom: none; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-right: 6px; }
  .badge-n1 { background: rgba(194,25,48,0.1); color: #c21930; }
  .badge-chatty { background: rgba(224,112,32,0.1); color: #e07020; }
  .badge-circular { background: rgba(112,64,204,0.1); color: #7040cc; }
  .badge-slow { background: rgba(48,96,204,0.1); color: #3060cc; }
  .green { color: #1a7f37; }
  .arow td:first-child { color: #666; font-size: 12px; }
  .arow td:last-child { font-weight: 600; font-size: 12px; }
  .footer { margin-top: 56px; font-size: 10px; color: #bbb; border-top: 1px solid #eee; padding-top: 14px; }
  .print-bar { background:#1a7f37; color:#fff; padding:10px 20px; margin:-48px -48px 32px; display:flex; justify-content:space-between; align-items:center; }
  .print-btn { background:#fff; color:#1a7f37; border:none; padding:6px 18px; border-radius:6px; font-weight:700; cursor:pointer; font-size:13px; }
  @media print { .print-bar { display: none; } body { padding: 24px; } }
</style>
</head>
<body>
<div class="print-bar">
  <span style="font-weight:600;font-size:14px;">Pattern Problems — Executive Summary</span>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
</div>
<h1>Pattern Problems — Executive Summary</h1>
<div class="meta">Generated ${dateStr} &nbsp;·&nbsp; Timeframe: ${timeframeLabel} &nbsp;·&nbsp; Powered by Dynatrace</div>

<div class="section-title">Projected Annual Cost Impact by Pattern</div>
<div class="cost-grid">
  <div class="cost-card"><div class="cost-label">N+1 Database Queries</div><div class="cost-value">${fmt(data.n1Cost)}</div><div class="cost-sub">${fmtNum(data.n1Services)} affected services</div></div>
  <div class="cost-card"><div class="cost-label">Chatty APIs</div><div class="cost-value">${fmt(data.chattyCost)}</div><div class="cost-sub">${fmtNum(data.chattyServices)} affected services</div></div>
  <div class="cost-card"><div class="cost-label">Circular Dependencies</div><div class="cost-value">${fmt(data.circularCost)}</div><div class="cost-sub">${fmtNum(data.circularServices)} affected services</div></div>
  <div class="cost-card"><div class="cost-label">Slow Consumers</div><div class="cost-value">${fmt(data.slowCost)}</div><div class="cost-sub">${fmtNum(data.slowServices)} affected services</div></div>
</div>
<div class="total-bar"><span class="total-label">Total Estimated Annual Savings</span><span class="total-value">${fmt(total)}</span></div>

<div class="section-title">Return on Investment</div>
<table>
  <thead><tr><th>Pattern</th><th>Affected</th><th>Annual Savings</th><th>Fix Investment</th><th>Payback Period</th></tr></thead>
  <tbody>
    <tr><td><span class="badge badge-n1">N+1</span> Database Queries</td><td>${fmtNum(data.n1Services)} services</td><td class="green">${fmt(data.n1Cost)}</td><td>${fmt(data.n1Investment)}</td><td>${payback(data.n1Cost, data.n1Investment)}</td></tr>
    <tr><td><span class="badge badge-chatty">Chatty</span> API Patterns</td><td>${fmtNum(data.chattyServices)} services</td><td class="green">${fmt(data.chattyCost)}</td><td>${fmt(data.chattyInvestment)}</td><td>${payback(data.chattyCost, data.chattyInvestment)}</td></tr>
    <tr><td><span class="badge badge-circular">Circular</span> Dependencies</td><td>${fmtNum(data.circularServices)} services</td><td class="green">${fmt(data.circularCost)}</td><td>${fmt(data.circularInvestment)}</td><td>${payback(data.circularCost, data.circularInvestment)}</td></tr>
    <tr><td><span class="badge badge-slow">Slow</span> Consumer Patterns</td><td>${fmtNum(data.slowServices)} services</td><td class="green">${fmt(data.slowCost)}</td><td>${fmt(data.slowInvestment)}</td><td>${payback(data.slowCost, data.slowInvestment)}</td></tr>
    <tr class="total-row"><td>All Patterns Combined</td><td>—</td><td class="green">${fmt(total)}</td><td>${fmt(totalInv)}</td><td>${payback(total, totalInv)}</td></tr>
  </tbody>
</table>

<div class="section-title">Cost Assumptions</div>
<table>
  <tbody>
    <tr class="arow"><td>Monthly DB Infrastructure Cost</td><td>${fmt(settings.monthlyDbCost)}/mo</td></tr>
    <tr class="arow"><td>Monthly App Server Cost</td><td>${fmt(settings.monthlyAppServerCost)}/mo</td></tr>
    <tr class="arow"><td>DB % of App Compute</td><td>${settings.dbComputePct}%</td></tr>
    <tr class="arow"><td>Network Egress Rate</td><td>$${settings.networkEgressRatePerGb}/GB</td></tr>
    <tr class="arow"><td>Avg Query Payload / Avg API Payload</td><td>${settings.avgPayloadKb} KB / ${settings.avgApiPayloadKb} KB</td></tr>
    <tr class="arow"><td>Cost per Million API Requests</td><td>$${settings.costPerMillionApiRequests}/million</td></tr>
    <tr class="arow"><td>Engineer Hourly Rate</td><td>$${settings.engineerHourlyRate}/hr</td></tr>
    <tr class="arow"><td>Monthly Incidents × MTTR × Engineers</td><td>${settings.monthlyDbIncidents}/mo × ${settings.avgMttrHours}h × ${settings.engineersPerIncident} engineers</td></tr>
    <tr class="arow"><td>Remediation Effort (N+1 / Chatty / Circular / Slow)</td><td>${settings.devHoursPerN1Fix}h / ${settings.devHoursPerChattyFix}h / ${settings.devHoursPerCircularFix}h / ${settings.devHoursPerSlowFix}h per service</td></tr>
  </tbody>
</table>

<div class="footer">Generated by Pattern Problems app powered by Dynatrace. Cost projections are estimates based on observed telemetry patterns and provided assumptions. Actual savings may vary. All figures are annualized from the selected observation window (${timeframeLabel}).</div>
</body>
</html>`;
}

const noopInsights = (): AIInsightsData => ({
  summary: "Executive Summary provides a cross-pattern cost rollup and ROI analysis.",
  insights: [],
  recommendations: [],
});

export function ExecutiveSummary() {
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
  const annualMultiplier = useMemo(() => getAnnualMultiplier(timeframe.from), [timeframe.from]);

  const n1Result = useDql({
    query: `fetch spans, ${tf}
| filter db.system != "null"
| filterOut contains(db.query.text, "INSERT")
| summarize
    s = sum(toDouble(aggregation.count)),
    s1 = sum(if(aggregation.count > 1, toDouble(aggregation.count), 0.0)),
    c1 = toDouble(countif(aggregation.count > 1)),
    n1_services = countDistinct(if(aggregation.count > 1, dt.entity.service, null))
| fieldsAdd reducible = s1 - c1, reduction_fraction = if(s > 0, (s1 - c1) / s, 0.0)`,
  });

  const chattyResult = useDql({
    query: `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd svc = entityName(dt.entity.service)
| summarize calls = count(), by: {svc}
| filter calls > 50
| summarize total_chatty_calls = sum(calls), chatty_services = count()`,
  });

  const circularResult = useDql({
    query: `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd svc = entityName(dt.entity.service), tid = toString(trace.id)
| summarize appearances = count(), by: {tid, svc}
| filter appearances > 1
| summarize circular_traces = count(), by: {svc}
| summarize total_circular_calls = sum(circular_traces), circular_services = count()`,
  });

  const slowResult = useDql({
    query: `fetch spans, ${tf}
| filter isNotNull(dt.entity.service)
| fieldsAdd svc = entityName(dt.entity.service), dur_ms = toDouble(duration) / 1000000.0
| summarize avg_dur = avg(dur_ms), p99_dur = percentile(dur_ms, 99), total_spans = count(), by: {svc}
| fieldsAdd variance_ratio = p99_dur / avg_dur, wasted_ms = total_spans * 0.01 * if(p99_dur > avg_dur, p99_dur - avg_dur, 0.0)
| filter variance_ratio > 5 and total_spans > 10
| summarize total_wasted_ms = sum(wasted_ms), high_var_services = count(), long_tail_count = countif(p99_dur > 5000)`,
  });

  const isLoading =
    n1Result.isLoading || chattyResult.isLoading || circularResult.isLoading || slowResult.isLoading;

  const data = useMemo<ExecData | null>(() => {
    if (isLoading) return null;

    const n1Row = n1Result.data?.records?.[0] ?? {};
    const chattyRow = chattyResult.data?.records?.[0] ?? {};
    const circularRow = circularResult.data?.records?.[0] ?? {};
    const slowRow = slowResult.data?.records?.[0] ?? {};

    const {
      monthlyDbCost, avgPayloadKb, networkEgressRatePerGb, monthlyAppServerCost,
      dbComputePct, engineerHourlyRate, monthlyDbIncidents, avgMttrHours, engineersPerIncident,
      avgApiPayloadKb, costPerMillionApiRequests,
      devHoursPerN1Fix, devHoursPerChattyFix, devHoursPerCircularFix, devHoursPerSlowFix,
    } = costSettings;

    const annualIncidentCost = monthlyDbIncidents * 12 * avgMttrHours * engineersPerIncident * engineerHourlyRate;

    // N+1
    const reductionFraction = Number(n1Row.reduction_fraction ?? 0);
    const reducible = Number(n1Row.reducible ?? 0);
    const n1Services = Number(n1Row.n1_services ?? 0);
    const n1Cost =
      reductionFraction * monthlyDbCost * 12 +
      reducible * annualMultiplier * (avgPayloadKb / (1024 * 1024)) * networkEgressRatePerGb +
      (dbComputePct / 100) * reductionFraction * monthlyAppServerCost * 12 +
      annualIncidentCost * reductionFraction;

    // Chatty
    const totalChattyCalls = Number(chattyRow.total_chatty_calls ?? 0);
    const chattyServices = Number(chattyRow.chatty_services ?? 0);
    const annualChattyCalls = totalChattyCalls * annualMultiplier;
    const chattyCost =
      annualChattyCalls * (avgApiPayloadKb / (1024 * 1024)) * networkEgressRatePerGb +
      annualChattyCalls * (costPerMillionApiRequests / 1_000_000) +
      annualIncidentCost * Math.min(1, chattyServices / 10);

    // Circular
    const totalCircularCalls = Number(circularRow.total_circular_calls ?? 0);
    const circularServices = Number(circularRow.circular_services ?? 0);
    const annualCircularCalls = totalCircularCalls * annualMultiplier;
    const circularCost =
      annualCircularCalls * (costPerMillionApiRequests / 1_000_000) +
      Math.min(circularServices, monthlyDbIncidents) * 12 * avgMttrHours * engineersPerIncident * engineerHourlyRate +
      circularServices * engineerHourlyRate * 2 * 12;

    // Slow
    const totalWastedMs = Number(slowRow.total_wasted_ms ?? 0);
    const highVarServices = Number(slowRow.high_var_services ?? 0);
    const longTailCount = Number(slowRow.long_tail_count ?? 0);
    const annualWastedSeconds = (totalWastedMs / 1000) * annualMultiplier;
    const serverCostPerSecond = (monthlyAppServerCost * 12) / (365 * 24 * 3600);
    const slowCost =
      annualWastedSeconds * serverCostPerSecond +
      longTailCount * annualMultiplier * 3 * (costPerMillionApiRequests / 1_000_000) +
      annualIncidentCost * Math.min(1, highVarServices / 5);

    return {
      n1Cost, n1Services, n1Investment: n1Services * devHoursPerN1Fix * engineerHourlyRate,
      chattyCost, chattyServices, chattyInvestment: chattyServices * devHoursPerChattyFix * engineerHourlyRate,
      circularCost, circularServices, circularInvestment: circularServices * devHoursPerCircularFix * engineerHourlyRate,
      slowCost, slowServices: highVarServices, slowInvestment: highVarServices * devHoursPerSlowFix * engineerHourlyRate,
    };
  }, [n1Result.data, chattyResult.data, circularResult.data, slowResult.data, isLoading, costSettings, annualMultiplier]);

  const { panel: aiPanel } = useAIInsights(noopInsights, aiOpen, closeAi);

  const total = data ? data.n1Cost + data.chattyCost + data.circularCost + data.slowCost : 0;
  const totalInvestment = data
    ? data.n1Investment + data.chattyInvestment + data.circularInvestment + data.slowInvestment
    : 0;

  const paybackDays = (cost: number, inv: number) =>
    cost > 0 && inv > 0 ? `${Math.ceil(inv / cost * 365)} days` : "—";

  const handleExportPdf = () => {
    if (!data) return;
    const html = generatePdfHtml(data, costSettings, timeframe.displayLabel);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) win.focus();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  };

  type PatternKey = "n1" | "chatty" | "circular" | "slow";
  const patterns: Array<{ key: PatternKey; label: string; badge: string; cls: string }> = [
    { key: "n1", label: "Database Queries", badge: "N+1", cls: "pp-exec-badge-n1" },
    { key: "chatty", label: "API Patterns", badge: "Chatty", cls: "pp-exec-badge-chatty" },
    { key: "circular", label: "Dependencies", badge: "Circular", cls: "pp-exec-badge-circular" },
    { key: "slow", label: "Consumer Patterns", badge: "Slow", cls: "pp-exec-badge-slow" },
  ];

  const costFor = (k: PatternKey) => data ? data[`${k}Cost` as keyof ExecData] as number : 0;
  const svcsFor = (k: PatternKey) => data ? data[`${k}Services` as keyof ExecData] as number : 0;
  const invFor = (k: PatternKey) => data ? data[`${k}Investment` as keyof ExecData] as number : 0;

  return (
    <AIInsightsContext.Provider value={aiCtx}>
      <AppHeader aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />
      {aiPanel}

      <div style={{ padding: "0 4px" }}>
        {/* Hero total */}
        <div className="pp-exec-hero">
          <div>
            <div className="pp-exec-hero-label">Total Estimated Annual Savings</div>
            <div className="pp-exec-hero-value">{isLoading ? "Calculating…" : fmt(total)}</div>
            <div className="pp-exec-hero-sub">
              Based on {timeframe.displayLabel} &nbsp;·&nbsp; Annualized ×{annualMultiplier}
            </div>
          </div>
          <Button variant="emphasized" onClick={handleExportPdf} disabled={isLoading || !data}>
            Export PDF
          </Button>
        </div>

        {/* Per-pattern cost cards */}
        <div className="pp-cost-grid" style={{ marginBottom: 24 }}>
          {patterns.map(p => (
            <div key={p.key} className="pp-cost-card">
              <div className="pp-cost-card-label">
                <span className={`pp-exec-badge ${p.cls}`}>{p.badge}</span>
                {p.label}
              </div>
              <div className="pp-cost-card-value">{isLoading ? "…" : fmt(costFor(p.key))}</div>
              <div className="pp-cost-card-basis">{isLoading ? "" : `${fmtNum(svcsFor(p.key))} services`}</div>
            </div>
          ))}
        </div>

        {/* ROI Table */}
        <div className="pp-cost-section" style={{ marginBottom: 24 }}>
          <div className="pp-cost-section-header">
            <div className="pp-cost-section-title">Return on Investment</div>
            <div className="pp-cost-section-meta">Annual savings vs. estimated remediation effort</div>
          </div>
          <div className="pp-exec-table-wrap">
            <table className="pp-exec-table">
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Affected Services</th>
                  <th>Annual Savings</th>
                  <th>Fix Investment</th>
                  <th>Payback Period</th>
                </tr>
              </thead>
              <tbody>
                {patterns.map(p => (
                  <tr key={p.key}>
                    <td>
                      <span className={`pp-exec-badge ${p.cls}`}>{p.badge}</span>
                      {p.label}
                    </td>
                    <td>{isLoading ? "…" : `${fmtNum(svcsFor(p.key))} services`}</td>
                    <td className="pp-exec-savings">{isLoading ? "…" : fmt(costFor(p.key))}</td>
                    <td>{isLoading ? "…" : fmt(invFor(p.key))}</td>
                    <td>{isLoading ? "…" : paybackDays(costFor(p.key), invFor(p.key))}</td>
                  </tr>
                ))}
                <tr className="pp-exec-total-row">
                  <td>All Patterns Combined</td>
                  <td>—</td>
                  <td className="pp-exec-savings">{isLoading ? "…" : fmt(total)}</td>
                  <td>{isLoading ? "…" : fmt(totalInvestment)}</td>
                  <td>{isLoading ? "…" : paybackDays(total, totalInvestment)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Assumptions */}
        <div className="pp-cost-section">
          <div className="pp-cost-section-header">
            <div className="pp-cost-section-title">Assumptions</div>
            <div className="pp-cost-section-meta">Adjust via the gear icon to match your environment</div>
          </div>
          <div className="pp-exec-assumptions">
            {([
              ["Monthly DB Cost", fmt(costSettings.monthlyDbCost) + "/mo"],
              ["Monthly App Server Cost", fmt(costSettings.monthlyAppServerCost) + "/mo"],
              ["DB % of App Compute", `${costSettings.dbComputePct}%`],
              ["Network Egress Rate", `$${costSettings.networkEgressRatePerGb}/GB`],
              ["Avg Query Payload / API Payload", `${costSettings.avgPayloadKb} KB / ${costSettings.avgApiPayloadKb} KB`],
              ["Cost per Million API Requests", `$${costSettings.costPerMillionApiRequests}`],
              ["Engineer Hourly Rate", `$${costSettings.engineerHourlyRate}/hr`],
              ["Monthly Incidents × MTTR × Engineers", `${costSettings.monthlyDbIncidents}/mo × ${costSettings.avgMttrHours}h × ${costSettings.engineersPerIncident}`],
              ["Remediation (N+1 / Chatty / Circular / Slow)", `${costSettings.devHoursPerN1Fix}h / ${costSettings.devHoursPerChattyFix}h / ${costSettings.devHoursPerCircularFix}h / ${costSettings.devHoursPerSlowFix}h per service`],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="pp-exec-assumption-row">
                <span className="pp-exec-assumption-label">{label}</span>
                <span className="pp-exec-assumption-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AIInsightsContext.Provider>
  );
}
