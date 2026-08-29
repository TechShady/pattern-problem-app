import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Select } from "@dynatrace/strato-components-preview/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { AIInsightsButton } from "./AIInsights";
import { useTimeframe, TIMEFRAME_OPTIONS } from "../TimeframeContext";
import { HelpContent } from "./HelpContent";
import { CostSettings, COST_DEFAULTS, loadCostSettings, saveCostSettings } from "../CostSettings";
import appConfig from "../../../app.config.json";

interface AppHeaderProps {
  aiOpen: boolean;
  onAiToggle: () => void;
}

interface SettingRowProps {
  label: string;
  hint: string;
  value: number;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}

function SettingRow({ label, hint, value, onChange, prefix, suffix, step }: SettingRowProps) {
  return (
    <div className="pp-setting-row">
      <div className="pp-setting-row-label">
        <div className="pp-setting-label">{label}</div>
        <div className="pp-setting-hint">{hint}</div>
      </div>
      <div className="pp-setting-input-wrap">
        {prefix && <span className="pp-setting-affix">{prefix}</span>}
        <input
          type="number"
          className="pp-setting-input"
          value={value}
          min={0}
          step={step ?? 1}
          onChange={e => onChange(e.target.value)}
        />
        {suffix && <span className="pp-setting-affix">{suffix}</span>}
      </div>
    </div>
  );
}

export function AppHeader({ aiOpen, onAiToggle }: AppHeaderProps) {
  const { timeframe, setTimeframe } = useTimeframe();
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<CostSettings>(COST_DEFAULTS);

  const openSettings = () => {
    setDraft(loadCostSettings());
    setShowSettings(true);
  };

  const handleSave = () => {
    saveCostSettings(draft);
    setShowSettings(false);
  };

  const handleReset = () => setDraft({ ...COST_DEFAULTS });

  const set = (key: keyof CostSettings) => (val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) setDraft(prev => ({ ...prev, [key]: n }));
  };

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
          <button onClick={openSettings} className="pp-help-btn" title="Cost Impact Settings">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="rgba(128,128,128,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="9" r="2.5" />
              <path d="M9 1.5v1.8M9 14.7v1.8M1.5 9h1.8M14.7 9h1.8M3.7 3.7l1.27 1.27M13.03 13.03l1.27 1.27M14.3 3.7l-1.27 1.27M4.97 13.03l-1.27 1.27" />
            </svg>
          </button>
          <button onClick={() => setShowHelp(true)} className="pp-help-btn" title="Help">
            <svg width="22" height="22" viewBox="0 0 22 22">
              <circle cx="11" cy="11" r="10" fill="none" stroke="rgba(128,128,128,0.5)" strokeWidth="1.5" />
              <text x="11" y="15.5" textAnchor="middle" fill="rgba(128,128,128,0.7)" fontSize="14" fontWeight="700">?</text>
            </svg>
          </button>
        </div>
      </div>

      <Sheet
        title="Cost Impact Settings"
        show={showSettings}
        onDismiss={() => setShowSettings(false)}
        actions={
          <Flex gap={8}>
            <Button variant="default" onClick={handleReset}>Reset to Defaults</Button>
            <Button variant="emphasized" onClick={handleSave}>Save</Button>
          </Flex>
        }
      >
        <div className="pp-settings-body">
          <div className="pp-setting-section">Database Infrastructure</div>
          <SettingRow
            label="Monthly DB Cost"
            hint="Total monthly database cost — compute, storage, and licensing"
            value={draft.monthlyDbCost}
            onChange={set("monthlyDbCost")}
            prefix="$"
            step={500}
          />

          <div className="pp-setting-section">Network</div>
          <SettingRow
            label="Avg Query Response Size"
            hint="Average data transferred per query round-trip (request + result set)"
            value={draft.avgPayloadKb}
            onChange={set("avgPayloadKb")}
            suffix="KB"
            step={0.5}
          />
          <SettingRow
            label="Network Egress Rate"
            hint="Cloud provider egress cost per GB — AWS: $0.09, Azure: $0.087, GCP: $0.08"
            value={draft.networkEgressRatePerGb}
            onChange={set("networkEgressRatePerGb")}
            prefix="$"
            suffix="/GB"
            step={0.01}
          />

          <div className="pp-setting-section">Application Compute</div>
          <SettingRow
            label="Monthly App Server Cost"
            hint="Total monthly application server and compute cost"
            value={draft.monthlyAppServerCost}
            onChange={set("monthlyAppServerCost")}
            prefix="$"
            step={500}
          />
          <SettingRow
            label="DB % of App Compute"
            hint="Estimated percentage of app server resources consumed by database operations"
            value={draft.dbComputePct}
            onChange={set("dbComputePct")}
            suffix="%"
            step={5}
          />

          <div className="pp-setting-section">API &amp; Service Calls</div>
          <SettingRow
            label="Avg API Payload Size"
            hint="Average data transferred per API call (request + response) — used for Chatty API network savings"
            value={draft.avgApiPayloadKb}
            onChange={set("avgApiPayloadKb")}
            suffix="KB"
            step={1}
          />
          <SettingRow
            label="Cost per Million API Requests"
            hint="Compute + network cost per million service-to-service API calls (includes both caller and receiver)"
            value={draft.costPerMillionApiRequests}
            onChange={set("costPerMillionApiRequests")}
            prefix="$"
            suffix="/million"
            step={0.5}
          />

          <div className="pp-setting-section">Engineering &amp; Incidents</div>
          <SettingRow
            label="Engineer Hourly Rate"
            hint="Fully-loaded hourly cost per engineer (salary + benefits + overhead)"
            value={draft.engineerHourlyRate}
            onChange={set("engineerHourlyRate")}
            prefix="$"
            suffix="/hr"
            step={10}
          />
          <SettingRow
            label="Monthly DB-Related Incidents"
            hint="Average number of database performance incidents per month attributable to query patterns"
            value={draft.monthlyDbIncidents}
            onChange={set("monthlyDbIncidents")}
            step={1}
          />
          <SettingRow
            label="Avg Incident Duration"
            hint="Mean time to resolve a database-related incident"
            value={draft.avgMttrHours}
            onChange={set("avgMttrHours")}
            suffix="hrs"
            step={0.5}
          />
          <SettingRow
            label="Engineers per Incident"
            hint="Average number of engineers pulled into each incident"
            value={draft.engineersPerIncident}
            onChange={set("engineersPerIncident")}
            step={1}
          />
        </div>
      </Sheet>

      <Sheet title="Pattern Problems — Help & Documentation" show={showHelp} onDismiss={() => setShowHelp(false)} actions={<Button variant="emphasized" onClick={() => setShowHelp(false)}>Close</Button>}>
        <HelpContent />
      </Sheet>
    </>
  );
}
