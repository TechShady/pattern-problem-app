import React, { useMemo, createContext, useContext } from "react";
import { Text, Strong } from "@dynatrace/strato-components/typography";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type InsightSeverity = "good" | "warning" | "critical" | "info";
export type InsightItem = { severity: InsightSeverity; icon: string; text: string };
export type RecommendationItem = { impact: "high" | "medium" | "low"; text: string };
export type AIInsightsData = { summary: string; insights: InsightItem[]; recommendations: RecommendationItem[] };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
export const AIInsightsContext = createContext<{ open: boolean; close: () => void }>({ open: false, close: () => {} });

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
export function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 4L15.2 9.6L20 12L15.2 14.4L14 20L12.8 14.4L8 12L12.8 9.6Z" fill="url(#sparkle-grad)" />
      <path d="M7 2L7.7 4.8L10 6L7.7 7.2L7 10L6.3 7.2L4 6L6.3 4.8Z" fill="url(#sparkle-grad)" />
      <path d="M5 13L5.5 14.8L7 16L5.5 17.2L5 19L4.5 17.2L3 16L4.5 14.8Z" fill="url(#sparkle-grad)" />
      <defs><linearGradient id="sparkle-grad" x1="3" y1="2" x2="20" y2="20"><stop stopColor="#c084fc" /><stop offset="1" stopColor="#818cf8" /></linearGradient></defs>
    </svg>
  );
}

export function AIInsightsButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button className={`pp-ai-btn${active ? " active" : ""}`} onClick={onClick}>
      <SparkleIcon />
      AI Insights
    </button>
  );
}

function StreamText({ text, baseDelay, style }: { text: string; baseDelay: number; style?: React.CSSProperties }) {
  const words = text.split(/(\s+)/);
  let wordIndex = 0;
  return (
    <Text style={style}>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return w;
        const delay = baseDelay + wordIndex * 60;
        wordIndex++;
        return <span key={i} className="pp-ai-stream-word" style={{ animationDelay: `${delay}ms` }}>{w}</span>;
      })}
    </Text>
  );
}

export function AIInsightsPanel({ data, onClose }: { data: AIInsightsData; onClose: () => void }) {
  const summaryWords = data.summary.split(/\s+/).length;
  const summaryDuration = summaryWords * 60;
  let insightOffset = summaryDuration + 400;
  const insightDurations: number[] = data.insights.map(ins => ins.text.split(/\s+/).length * 60);

  return (
    <div className="pp-ai-panel">
      <div className="pp-ai-panel-header">
        <SparkleIcon />
        <Strong style={{ flex: 1 }}>AI Insights</Strong>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16, opacity: 0.5, padding: "2px 6px" }}>✕</button>
      </div>
      <div className="pp-ai-panel-body">
        <div style={{ marginBottom: 16 }}>
          <div className="pp-ai-section-title" style={{ opacity: 0, animation: "pp-ai-typewriter 0.3s ease forwards", animationDelay: "100ms" }}>Summary</div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(165,110,255,0.06)", border: "1px solid rgba(165,110,255,0.12)" }}>
            <StreamText text={data.summary} baseDelay={200} style={{ fontSize: 13, lineHeight: "1.5" }} />
          </div>
        </div>

        {data.insights.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="pp-ai-section-title" style={{ opacity: 0, animation: "pp-ai-typewriter 0.3s ease forwards", animationDelay: `${insightOffset - 200}ms` }}>Insights</div>
            {data.insights.map((ins, i) => {
              const myOffset = insightOffset;
              insightOffset += insightDurations[i] + 240;
              return (
                <div key={i} className={`pp-ai-insight-row ${ins.severity}`} style={{ opacity: 0, animation: "pp-ai-typewriter 0.3s ease forwards", animationDelay: `${myOffset - 100}ms` }}>
                  <Text style={{ fontSize: 14, flexShrink: 0 }}>{ins.icon}</Text>
                  <StreamText text={ins.text} baseDelay={myOffset} style={{ fontSize: 13 }} />
                </div>
              );
            })}
          </div>
        )}

        {data.recommendations.length > 0 && (
          <div>
            <div className="pp-ai-section-title" style={{ opacity: 0, animation: "pp-ai-typewriter 0.3s ease forwards", animationDelay: `${insightOffset}ms` }}>Recommendations</div>
            {data.recommendations.map((rec, i) => {
              const myOffset = insightOffset + 300 + i * 800;
              return (
                <div key={i} className="pp-ai-recommendation" style={{ opacity: 0, animation: "pp-ai-typewriter 0.3s ease forwards", animationDelay: `${myOffset}ms` }}>
                  <span className={`pp-ai-rec-badge ${rec.impact}`}>{rec.impact}</span>
                  <StreamText text={rec.text} baseDelay={myOffset + 100} style={{ fontSize: 13 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function useAIInsights(analysisFn: () => AIInsightsData): { panel: React.ReactNode } {
  const { open, close } = useContext(AIInsightsContext);
  const data = useMemo(() => open ? analysisFn() : null, [open, analysisFn]);
  return {
    panel: open && data ? <AIInsightsPanel data={data} onClose={close} /> : null,
  };
}
