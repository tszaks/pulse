import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { getStats, getTopPages, getTopReferrers } from '../lib/umami-client.js';
import { formatOverview, formatTopPages, formatReferrers } from '../lib/llm-formatter.js';
import { getSites } from '../lib/umami-client.js';
import { PERIODS } from '../types.js';
import type { Period } from '../types.js';

const VALID_PERIODS = new Set<Period>(PERIODS);
const PERIOD_ERROR = `period must be ${PERIODS.join(', ')}`;

export async function metricsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: { period?: string } }>(
    '/v1/sites/:id/metrics',
    { preHandler: requireApiKey },
    async (req, reply) => {
      const period = (req.query.period ?? '7d') as Period;
      if (!VALID_PERIODS.has(period)) {
        return reply.code(400).send({ error: PERIOD_ERROR });
      }

      const [stats, topPages, topReferrers, sites] = await Promise.all([
        getStats(req.params.id, period),
        getTopPages(req.params.id, period),
        getTopReferrers(req.params.id, period),
        getSites(),
      ]);

      const site = sites.find(s => s.id === req.params.id);
      const domain = site?.domain ?? req.params.id;

      const overview = formatOverview(domain, stats, period);
      const pages = formatTopPages(domain, topPages, period);

      return {
        summary: overview.summary,
        data: {
          period,
          domain,
          pageviews: stats.pageviews,
          visitors: stats.visitors,
          visits: stats.visits,
          bounceRate: stats.visits > 0
            ? Math.round((stats.bounces / stats.visits) * 100)
            : 0,
          topPages: topPages.slice(0, 10),
          topReferrers: topReferrers.slice(0, 10),
        },
        context_for_agent:
          overview.context_for_agent + ' ' + pages.context_for_agent,
      };
    }
  );
}
