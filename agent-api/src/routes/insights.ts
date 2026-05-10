import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { getStats, getTopPages, getTopReferrers, getSites } from '../lib/umami-client.js';
import { formatOverview, formatTopPages, formatReferrers } from '../lib/llm-formatter.js';

export async function insightsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/v1/sites/:id/insights',
    { preHandler: requireApiKey },
    async (req) => {
      const [stats7, stats30, topPages, topReferrers, sites] = await Promise.all([
        getStats(req.params.id, '7d'),
        getStats(req.params.id, '30d'),
        getTopPages(req.params.id, '7d', 5),
        getTopReferrers(req.params.id, '7d', 5),
        getSites(),
      ]);

      const site = sites.find(s => s.id === req.params.id);
      const domain = site?.domain ?? req.params.id;

      const week = formatOverview(domain, stats7, '7d');
      const month = formatOverview(domain, stats30, '30d');
      const pages = formatTopPages(domain, topPages, '7d');
      const refs = formatReferrers(domain, topReferrers, '7d');

      const insights = [
        { type: 'week_summary', headline: week.summary },
        { type: 'month_summary', headline: month.summary },
        { type: 'top_pages', headline: pages.summary },
        { type: 'top_referrers', headline: refs.summary },
      ];

      return {
        summary: `Insights for ${domain}: ${week.summary}`,
        data: { domain, insights, stats: { week: stats7, month: stats30 }, topPages, topReferrers },
        context_for_agent:
          `Here's a summary for ${domain}: ` +
          week.context_for_agent + ' ' +
          pages.context_for_agent + ' ' +
          refs.context_for_agent,
      };
    }
  );
}
