import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { getActiveVisitors, getSites } from '../lib/umami-client.js';
import { formatActiveVisitors } from '../lib/llm-formatter.js';

export async function activeRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/v1/sites/:id/active',
    { preHandler: requireApiKey },
    async (req) => {
      const [active, sites] = await Promise.all([
        getActiveVisitors(req.params.id),
        getSites(),
      ]);
      const site = sites.find(s => s.id === req.params.id);
      const domain = site?.domain ?? req.params.id;
      const formatted = formatActiveVisitors(domain, active.visitors);
      return {
        summary: formatted.summary,
        data: { domain, visitors: active.visitors },
        context_for_agent: formatted.context_for_agent,
      };
    }
  );
}
