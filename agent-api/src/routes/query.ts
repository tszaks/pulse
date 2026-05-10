import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { parseQuery } from '../lib/nl-parser.js';
import {
  getStats, getTopPages, getTopReferrers, getPageviewSeries,
  getBreakdown, getActiveVisitors, getSites,
} from '../lib/umami-client.js';
import { detectAnomalies } from '../lib/anomaly.js';
import {
  formatOverview, formatTopPages, formatReferrers, formatAnomalies,
  formatBreakdown, formatActiveVisitors, formatAvgTime,
} from '../lib/llm-formatter.js';
import type { ParsedQuery, Period } from '../types.js';

interface QueryBody {
  site_id?: string;
  domain?: string;
  question: string;
  /**
   * Optional: pre-parsed intent from your agent's own LLM.
   * If provided, Pulse skips its keyword parser and uses this directly.
   * Your agent can resolve complex or ambiguous questions before sending.
   *
   * Example (from your agent before calling Pulse):
   *   "what countries is my traffic coming from this month?"
   *   → parsed: { intent: "geo", period: "30d" }
   */
  parsed?: Pick<ParsedQuery, 'intent' | 'period'>;
}

export async function queryRoutes(app: FastifyInstance) {
  app.post<{ Body: QueryBody }>(
    '/v1/query',
    { preHandler: requireApiKey },
    async (req, reply) => {
      const { question, site_id, domain, parsed: preParsed } = req.body;
      if (!question) return reply.code(400).send({ error: 'question is required' });

      const sites = await getSites();
      let site = site_id ? sites.find(s => s.id === site_id) : undefined;
      if (!site && domain) site = sites.find(s => s.domain === domain);
      if (!site) return reply.code(404).send({ error: 'Site not found. Provide site_id or domain.' });

      // Use agent-supplied parsed intent if provided, otherwise run keyword parser
      const { intent, period } = preParsed ?? parseQuery(question);
      const resolvedPeriod = (period as Period) ?? '7d';

      if (intent === 'active') {
        const active = await getActiveVisitors(site.id);
        const fmt = formatActiveVisitors(site.domain, active.visitors);
        return { summary: fmt.summary, data: { visitors: active.visitors }, context_for_agent: fmt.context_for_agent, intent, period: resolvedPeriod };
      }

      if (intent === 'geo') {
        const rows = await getBreakdown(site.id, resolvedPeriod, 'country');
        const fmt = formatBreakdown(site.domain, rows, 'countries', resolvedPeriod);
        return { summary: fmt.summary, data: { countries: rows }, context_for_agent: fmt.context_for_agent, intent, period: resolvedPeriod };
      }

      if (intent === 'device') {
        const [devices, browsers, os] = await Promise.all([
          getBreakdown(site.id, resolvedPeriod, 'device'),
          getBreakdown(site.id, resolvedPeriod, 'browser'),
          getBreakdown(site.id, resolvedPeriod, 'os'),
        ]);
        const fmtDevice = formatBreakdown(site.domain, devices, 'device types', resolvedPeriod);
        const fmtBrowser = formatBreakdown(site.domain, browsers, 'browsers', resolvedPeriod);
        const context = fmtDevice.context_for_agent + ' ' + fmtBrowser.context_for_agent;
        return { summary: fmtDevice.summary, data: { devices, browsers, os }, context_for_agent: context, intent, period: resolvedPeriod };
      }

      if (intent === 'time') {
        const stats = await getStats(site.id, resolvedPeriod);
        const fmt = formatAvgTime(site.domain, stats.totaltime, stats.visits, resolvedPeriod);
        return { summary: fmt.summary, data: { totaltime: stats.totaltime, visits: stats.visits }, context_for_agent: fmt.context_for_agent, intent, period: resolvedPeriod };
      }

      if (intent === 'events') {
        const rows = await getBreakdown(site.id, resolvedPeriod, 'event');
        const fmt = formatBreakdown(site.domain, rows, 'custom events', resolvedPeriod);
        return { summary: fmt.summary, data: { events: rows }, context_for_agent: fmt.context_for_agent, intent, period: resolvedPeriod };
      }

      if (intent === 'anomalies') {
        const series = await getPageviewSeries(site.id, '30d');
        const anomalies = detectAnomalies(series.pageviews);
        const fmt = formatAnomalies(site.domain, anomalies);
        return { summary: fmt.summary, data: { anomalies }, context_for_agent: fmt.context_for_agent, intent, period: resolvedPeriod };
      }

      if (intent === 'top_pages') {
        const pages = await getTopPages(site.id, resolvedPeriod);
        const fmt = formatTopPages(site.domain, pages, resolvedPeriod);
        return { summary: fmt.summary, data: { topPages: pages }, context_for_agent: fmt.context_for_agent, intent, period: resolvedPeriod };
      }

      if (intent === 'referrers') {
        const refs = await getTopReferrers(site.id, resolvedPeriod);
        const fmt = formatReferrers(site.domain, refs, resolvedPeriod);
        return { summary: fmt.summary, data: { referrers: refs }, context_for_agent: fmt.context_for_agent, intent, period: resolvedPeriod };
      }

      // Default: full overview — stats + top pages + referrers
      const [stats, topPages, topRefs] = await Promise.all([
        getStats(site.id, resolvedPeriod),
        getTopPages(site.id, resolvedPeriod, 5),
        getTopReferrers(site.id, resolvedPeriod, 5),
      ]);
      const overview = formatOverview(site.domain, stats, resolvedPeriod);
      const pages = formatTopPages(site.domain, topPages, resolvedPeriod);
      const refs2 = formatReferrers(site.domain, topRefs, resolvedPeriod);
      return {
        summary: overview.summary,
        data: { stats, topPages, topRefs },
        context_for_agent: overview.context_for_agent + ' ' + pages.context_for_agent + ' ' + refs2.context_for_agent,
        intent,
        period: resolvedPeriod,
      };
    }
  );
}
