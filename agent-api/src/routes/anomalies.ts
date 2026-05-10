import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { getPageviewSeries, getSites } from '../lib/umami-client.js';
import { detectAnomalies } from '../lib/anomaly.js';
import { formatAnomalies } from '../lib/llm-formatter.js';

export async function anomaliesRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/v1/sites/:id/anomalies',
    { preHandler: requireApiKey },
    async (req) => {
      const [series, sites] = await Promise.all([
        getPageviewSeries(req.params.id, '30d'),
        getSites(),
      ]);

      const site = sites.find(s => s.id === req.params.id);
      const domain = site?.domain ?? req.params.id;
      const anomalies = detectAnomalies(series.pageviews);
      const formatted = formatAnomalies(domain, anomalies);

      return {
        summary: formatted.summary,
        data: { domain, anomalies, seriesLength: series.pageviews.length },
        context_for_agent: formatted.context_for_agent,
      };
    }
  );
}
