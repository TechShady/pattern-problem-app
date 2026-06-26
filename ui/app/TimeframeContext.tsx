import React, { createContext, useContext, useState, useMemo } from "react";

export interface TimeframeState {
  from: string;
  to: string;
  displayLabel: string;
}

interface TimeframeContextValue {
  timeframe: TimeframeState;
  setTimeframe: (tf: TimeframeState) => void;
}

const DEFAULT_TF: TimeframeState = { from: "now()-2h", to: "now()", displayLabel: "Last 2 hours" };

const TimeframeContext = createContext<TimeframeContextValue>({
  timeframe: DEFAULT_TF,
  setTimeframe: () => {},
});

export function TimeframeProvider({ children }: { children: React.ReactNode }) {
  const [timeframe, setTimeframe] = useState<TimeframeState>(DEFAULT_TF);
  const value = useMemo(() => ({ timeframe, setTimeframe }), [timeframe]);
  return <TimeframeContext.Provider value={value}>{children}</TimeframeContext.Provider>;
}

export function useTimeframe() {
  return useContext(TimeframeContext);
}

export const TIMEFRAME_OPTIONS: { label: string; from: string; to: string }[] = [
  { label: "Last 2 hours", from: "now()-2h", to: "now()" },
  { label: "Last 6 hours", from: "now()-6h", to: "now()" },
  { label: "Last 12 hours", from: "now()-12h", to: "now()" },
  { label: "Last 24 hours", from: "now()-24h", to: "now()" },
  { label: "Last 3 days", from: "now()-3d", to: "now()" },
  { label: "Last 7 days", from: "now()-7d", to: "now()" },
  { label: "Last 14 days", from: "now()-14d", to: "now()" },
  { label: "Last 30 days", from: "now()-30d", to: "now()" },
];

/** Compute an appropriate DQL bin size string based on the selected timeframe */
export function getBinSize(from: string): string {
  const match = from.match(/now\(\)-(\d+)([hdm])/);
  if (!match) return "1h";
  const num = parseInt(match[1]);
  const unit = match[2];
  const hours = unit === "d" ? num * 24 : unit === "h" ? num : num / 60;
  if (hours <= 2) return "5m";
  if (hours <= 6) return "15m";
  if (hours <= 12) return "30m";
  if (hours <= 24) return "1h";
  if (hours <= 72) return "3h";
  if (hours <= 168) return "6h";
  if (hours <= 336) return "12h";
  return "1d";
}
