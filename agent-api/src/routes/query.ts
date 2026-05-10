import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { parseQuery } from '../lib/nl-parser.js';
import { getStats, getTopPages, getTopReferrers, getPageviewSeries, getSites } from '../lib/umami-client.js';
import { detectAnomalies } from '../lib/anomaly.js';
import { formatOverview, formatTopPages, formatReferrers, formatAnomalies } from '../lib/llm-formatter.js';

interface QueryBody {
  site_id?: string;
  domain?: string;
  question: string;
}

export async function queryRoutes(app: FastifyInstance) {
  app.post<{ Body: QueryBody }>(
    '/v1/query',
    { preHandler: requireApiKey },
    async (req, reply) => {
      const { question, site_id, domain } = req.body;
      if (!question) return reply.code(400).send({ error: 'question is required' });

      const sites = await getSites();
      let site = site_id ? sites.find(s => s.id === site_id) : undefined;
      if (!site && domain) site = sites.find(s => s.domain === domain);
      if (!site) return reply.code(404).send({ error: 'Site not found. Provide site_id or domain.' });

      const parsed = parseQuery(question);

      if (parsed.intent === 'anomalies') {
        const series = await getPageviewSeries(site.id, '30d');
        const anomalies = detectAnomalies(series.pageviews);
        const fmt = formatAnomalies(site.domain, anomalies);
        return { summary: fmt.summary, data: { anomalies }, context_for_agent: fmt.context_for_agent, parsed };
      }

      if (parsed.intent === 'top_pages') {
        const pages = await getTopPages(site.id, parsed.period);
        const fmt = formatTopPages(site.domain, pages, parsed.period);
        return { summary: fmt.summary, data: { topPages: pages }, context_for_agent: fmt.context_for_agent, parsed };
      }

      if (parsed.intent === 'referrers') {
        const refs = await getTopReferrers(site.id, parsed.period);
        const fmt = formatReferrers(site.domain, refs, parsed.period);
        return { summary: fmt.summary, data: { referrers: refs }, context_for_agent: fmt.context_for_agent, parsed };
      }

      // Default: overview + top pages
      const [stats, topPages, topRefs] = await Promise.all([
        getStats(site.id, parsed.period),
        getTopPages(site.id, parsed.period, 5),
        getTopReferrers(site.id, parsed.period, 5),
      ]);

      const overview = formatOverview(site.domain, stats, parsed.period);
      const pages = formatTopPages(site.domain, topPages, parsed.period);
      const refs = formatReferrers(site.domain, topRefs, parsed.period);

      return {
        summary: overview.summary,
        data: { stats, topPages, topRefs },
        context_for_agent:
          overview.context_for_agent + ' ' +
          pages.context_for_agent + ' ' +
          refs.context_for_agent,
        parsed,
      };
    }
  );
}
