import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Select } from "@dynatrace/strato-components-preview/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { AIInsightsButton } from "./AIInsights";
import { useTimeframe, TIMEFRAME_OPTIONS } from "../TimeframeContext";
import { HelpContent } from "./HelpContent";
import appConfig from "../../../app.config.json";

interface AppHeaderProps {
  aiOpen: boolean;
  onAiToggle: () => void;
}

export function AppHeader({ aiOpen, onAiToggle }: AppHeaderProps) {
  const { timeframe, setTimeframe } = useTimeframe();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <div className="pp-header">
        <div className="pp-header-left">
          <Heading level={4} style={{ margin: 0 }}>Pattern Problems</Heading>
          <Text style={{ fontSize: 11, opacity: 0.4, fontFamily: "monospace" }}>v{appConfig.app.version}</Text>
        </div>
        <div className="pp-header-right">
          <Select
            value={`${timeframe.from}|${timeframe.to}`}
            onChange={(val) => {
              if (!val) return;
              const opt = TIMEFRAME_OPTIONS.find(o => `${o.from}|${o.to}` === val);
              if (opt) setTimeframe({ from: opt.from, to: opt.to, displayLabel: opt.label });
            }}
          >
            <Select.Trigger style={{ minWidth: 140 }} />
            <Select.Content>
              {TIMEFRAME_OPTIONS.map(o => (
                <Select.Option key={o.label} value={`${o.from}|${o.to}`}>{o.label}</Select.Option>
              ))}
            </Select.Content>
          </Select>
          <AIInsightsButton active={aiOpen} onClick={onAiToggle} />
          <button onClick={() => setShowHelp(true)} className="pp-help-btn" title="Help">
            <svg width="22" height="22" viewBox="0 0 22 22">
              <circle cx="11" cy="11" r="10" fill="none" stroke="rgba(128,128,128,0.5)" strokeWidth="1.5" />
              <text x="11" y="15.5" textAnchor="middle" fill="rgba(128,128,128,0.7)" fontSize="14" fontWeight="700">?</text>
            </svg>
          </button>
        </div>
      </div>
      <Sheet title="Pattern Problems — Help & Documentation" show={showHelp} onDismiss={() => setShowHelp(false)} actions={<Button variant="emphasized" onClick={() => setShowHelp(false)}>Close</Button>}>
        <HelpContent />
      </Sheet>
    </>
  );
}
