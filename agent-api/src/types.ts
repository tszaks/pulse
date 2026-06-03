export interface UmamiSite {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
}

export interface UmamiStatComparison {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
}

export interface UmamiStats {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  comparison: UmamiStatComparison;
}

export interface UmamiMetricRow {
  x: string;
  y: number;
}

export interface UmamiPageviewPoint {
  x: string;
  y: number;
}

export interface UmamiPageviews {
  pageviews: UmamiPageviewPoint[];
  sessions: UmamiPageviewPoint[];
}

export interface AgentResponse {
  summary: string;
  data: unknown;
  context_for_agent: string;
}

export interface Anomaly {
  date: string;
  value: number;
  expected: number;
  zScore: number;
  direction: 'spike' | 'drop';
}

export interface ActiveVisitors {
  visitors: number;
}

export type BreakdownType = 'country' | 'city' | 'browser' | 'os' | 'device' | 'event';

export const PERIODS = ['1d', '7d', '14d', '30d', '90d'] as const;

export type Period = typeof PERIODS[number];

export const PERIOD_DAYS: Record<Period, number> = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

export interface ParsedQuery {
  intent: 'overview' | 'top_pages' | 'referrers' | 'anomalies' | 'insights' | 'geo' | 'device' | 'active' | 'time' | 'events';
  period: Period;
  originalQuestion: string;
}
