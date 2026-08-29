export interface CostSettings {
  monthlyDbCost: number;
  avgPayloadKb: number;
  networkEgressRatePerGb: number;
  monthlyAppServerCost: number;
  dbComputePct: number;
  engineerHourlyRate: number;
  monthlyDbIncidents: number;
  avgMttrHours: number;
  engineersPerIncident: number;
  avgApiPayloadKb: number;
  costPerMillionApiRequests: number;
}

export const COST_DEFAULTS: CostSettings = {
  monthlyDbCost: 10000,
  avgPayloadKb: 2,
  networkEgressRatePerGb: 0.09,
  monthlyAppServerCost: 5000,
  dbComputePct: 35,
  engineerHourlyRate: 150,
  monthlyDbIncidents: 2,
  avgMttrHours: 4,
  engineersPerIncident: 2,
  avgApiPayloadKb: 5,
  costPerMillionApiRequests: 2,
};

const KEY = "pp-cost-settings";
export const COST_SETTINGS_EVENT = "pp-cost-settings-changed";

export function loadCostSettings(): CostSettings {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? { ...COST_DEFAULTS, ...JSON.parse(stored) } : { ...COST_DEFAULTS };
  } catch {
    return { ...COST_DEFAULTS };
  }
}

export function saveCostSettings(s: CostSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(COST_SETTINGS_EVENT));
  } catch {}
}

export function getAnnualMultiplier(from: string): number {
  const match = from.match(/now\(\)-(\d+)([hdm])/);
  if (!match) return 52;
  const num = parseInt(match[1]);
  const unit = match[2];
  const hours = unit === 'h' ? num : unit === 'd' ? num * 24 : num / 60;
  return Math.ceil(8760 / hours);
}

export const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
