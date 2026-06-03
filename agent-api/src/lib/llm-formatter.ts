import type { UmamiStats, UmamiMetricRow, Anomaly, Period } from '../types.js';

function pct(current: number, prev: number): string {
  if (prev === 0) return '+∞%';
  const delta = ((current - prev) / prev) * 100;
  return (delta >= 0 ? '+' : '') + delta.toFixed(0) + '%';
}

function periodLabel(period: Period): string {
  return {
    '1d': 'today',
    '7d': 'this week',
    '14d': 'the last 14 days',
    '30d': 'this month',
    '90d': 'last 90 days',
  }[period];
}

export function formatOverview(
  domain: string,
  stats: UmamiStats,
  period: Period
): { summary: string; context_for_agent: string } {
  const { pageviews, visitors, visits, bounces, comparison } = stats;
  const pvDelta = pct(pageviews, comparison.pageviews);
  const visDelta = pct(visitors, comparison.visitors);
  const bounceRate = visits > 0 ? Math.round((bounces / visits) * 100) : 0;
  const label = periodLabel(period);

  const summary =
    `${domain} — ${label}: ` +
    `${pageviews.toLocaleString()} pageviews (${pvDelta} vs prior period), ` +
    `${visitors.toLocaleString()} unique visitors (${visDelta}), ` +
    `${bounceRate}% bounce rate.`;

  const context_for_agent =
    `${domain} had ${pageviews.toLocaleString()} pageviews ${label} — ` +
    `${pvDelta} compared to the previous period. ` +
    `${visitors.toLocaleString()} unique visitors, ${bounceRate}% bounce rate.`;

  return { summary, context_for_agent };
}

export function formatTopPages(
  domain: string,
  pages: UmamiMetricRow[],
  period: Period
): { summary: string; context_for_agent: string } {
  const label = periodLabel(period);
  const top3 = pages.slice(0, 3).map((p, i) => `${i + 1}. ${p.x} (${p.y.toLocaleString()} views)`).join(', ');
  const summary = `Top pages for ${domain} ${label}: ${top3}`;
  const context_for_agent = `Top pages on ${domain} ${label}: ${top3}.`;
  return { summary, context_for_agent };
}

export function formatReferrers(
  domain: string,
  referrers: UmamiMetricRow[],
  period: Period
): { summary: string; context_for_agent: string } {
  const label = periodLabel(period);
  const top3 = referrers.slice(0, 3).map((r, i) => `${i + 1}. ${r.x || 'Direct'} (${r.y.toLocaleString()})`).join(', ');
  const summary = `Top traffic sources for ${domain} ${label}: ${top3}`;
  const context_for_agent = `Top referrers for ${domain} ${label}: ${top3}.`;
  return { summary, context_for_agent };
}

export function formatBreakdown(
  domain: string,
  rows: UmamiMetricRow[],
  label: string,
  period: Period
): { summary: string; context_for_agent: string } {
  if (rows.length === 0) {
    const msg = `No ${label} data for ${domain} yet.`;
    return { summary: msg, context_for_agent: msg };
  }
  const top3 = rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.x || 'Unknown'} (${r.y.toLocaleString()})`).join(', ');
  const summary = `Top ${label} for ${domain} ${periodLabel(period)}: ${top3}`;
  return { summary, context_for_agent: summary + '.' };
}

export function formatActiveVisitors(
  domain: string,
  visitors: number
): { summary: string; context_for_agent: string } {
  const msg = visitors === 0
    ? `No active visitors on ${domain} right now.`
    : `${domain} has ${visitors} active visitor${visitors === 1 ? '' : 's'} right now.`;
  return { summary: msg, context_for_agent: msg };
}

export function formatAvgTime(
  domain: string,
  totaltime: number,
  visits: number,
  period: Period
): { summary: string; context_for_agent: string } {
  if (visits === 0) {
    const msg = `No session time data for ${domain} yet.`;
    return { summary: msg, context_for_agent: msg };
  }
  const avgSec = Math.round(totaltime / visits);
  const formatted = avgSec >= 60
    ? `${Math.floor(avgSec / 60)}m ${avgSec % 60}s`
    : `${avgSec}s`;
  const msg = `Average session duration on ${domain} ${periodLabel(period)}: ${formatted} (across ${visits.toLocaleString()} visits).`;
  return { summary: msg, context_for_agent: msg };
}

export function formatAnomalies(
  domain: string,
  anomalies: Anomaly[]
): { summary: string; context_for_agent: string } {
  if (anomalies.length === 0) {
    const summary = `No anomalies detected for ${domain} in the last 30 days.`;
    return { summary, context_for_agent: summary };
  }
  const top = anomalies[0];
  const summary =
    `${anomalies.length} anomaly${anomalies.length > 1 ? 's' : ''} detected for ${domain}. ` +
    `Biggest: ${top.direction} on ${top.date} (${top.value} views vs ~${top.expected} expected, z=${top.zScore}).`;
  const context_for_agent =
    `${domain} had a traffic ${top.direction} on ${top.date}: ` +
    `${top.value} pageviews vs the expected ~${top.expected}. ` +
    (anomalies.length > 1 ? `${anomalies.length - 1} other anomaly${anomalies.length > 2 ? 's' : ''} also detected.` : '');
  return { summary, context_for_agent };
}
