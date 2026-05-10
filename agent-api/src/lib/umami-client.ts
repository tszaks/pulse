import type { UmamiSite, UmamiStats, UmamiMetricRow, UmamiPageviews, ActiveVisitors, BreakdownType, Period } from '../types.js';

const BASE_URL = process.env.UMAMI_BASE_URL!;
const USERNAME  = process.env.UMAMI_USERNAME ?? 'admin';
const PASSWORD  = process.env.UMAMI_PASSWORD!;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function fetchUmami(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Umami API error ${res.status}: ${path}`);
  return res.json();
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) throw new Error('Umami login failed');
  const { token } = (await res.json()) as { token: string };
  cachedToken = token;
  tokenExpiresAt = Date.now() + 22 * 60 * 60 * 1000; // 22h (Umami default is 24h)
  return token;
}

export function periodToRange(period: Period): { startAt: number; endAt: number } {
  const endAt = Date.now();
  const days: Record<Period, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
  const startAt = endAt - days[period] * 24 * 60 * 60 * 1000;
  return { startAt, endAt };
}

export async function getSites(): Promise<UmamiSite[]> {
  const data = (await fetchUmami('/api/websites?pageSize=100')) as { data: UmamiSite[] };
  return data.data;
}

export async function getStats(siteId: string, period: Period): Promise<UmamiStats> {
  const { startAt, endAt } = periodToRange(period);
  return fetchUmami(
    `/api/websites/${siteId}/stats?startAt=${startAt}&endAt=${endAt}`
  ) as Promise<UmamiStats>;
}

export async function getTopPages(siteId: string, period: Period, limit = 10): Promise<UmamiMetricRow[]> {
  const { startAt, endAt } = periodToRange(period);
  try {
    const data = await fetchUmami(
      `/api/websites/${siteId}/metrics?type=url&startAt=${startAt}&endAt=${endAt}&limit=${limit}`
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getTopReferrers(siteId: string, period: Period, limit = 10): Promise<UmamiMetricRow[]> {
  const { startAt, endAt } = periodToRange(period);
  try {
    const data = await fetchUmami(
      `/api/websites/${siteId}/metrics?type=referrer&startAt=${startAt}&endAt=${endAt}&limit=${limit}`
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getBreakdown(siteId: string, period: Period, type: BreakdownType, limit = 10): Promise<UmamiMetricRow[]> {
  const { startAt, endAt } = periodToRange(period);
  try {
    const data = await fetchUmami(
      `/api/websites/${siteId}/metrics?type=${type}&startAt=${startAt}&endAt=${endAt}&limit=${limit}`
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getActiveVisitors(siteId: string): Promise<ActiveVisitors> {
  try {
    return fetchUmami(`/api/websites/${siteId}/active`) as Promise<ActiveVisitors>;
  } catch {
    return { visitors: 0 };
  }
}

export async function getPageviewSeries(siteId: string, period: Period): Promise<UmamiPageviews> {
  const { startAt, endAt } = periodToRange(period);
  const unit = period === '1d' ? 'hour' : 'day';
  return fetchUmami(
    `/api/websites/${siteId}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=${unit}&timezone=UTC`
  ) as Promise<UmamiPageviews>;
}
