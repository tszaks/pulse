import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { getBreakdown, getStats, getSites } from '../lib/umami-client.js';
import { formatBreakdown, formatAvgTime } from '../lib/llm-formatter.js';
import { PERIODS } from '../types.js';
import type { BreakdownType, Period } from '../types.js';

const VALID_TYPES = new Set<BreakdownType>(['country', 'city', 'browser', 'os', 'device', 'event']);
const VALID_PERIODS = new Set<Period>(PERIODS);
const PERIOD_ERROR = `period must be ${PERIODS.join(', ')}`;

const TYPE_LABELS: Record<BreakdownType, string> = {
  country: 'countries',
  city: 'cities',
  browser: 'browsers',
  os: 'operating systems',
  device: 'device types',
  event: 'custom events',
};

export async function breakdownRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: { type?: string; period?: string } }>(
    '/v1/sites/:id/breakdown',
    { preHandler: requireApiKey },
    async (req, reply) => {
      const type = (req.query.type ?? 'country') as BreakdownType;
      const period = (req.query.period ?? '7d') as Period;

      if (!VALID_TYPES.has(type)) {
        return reply.code(400).send({ error: `type must be one of: ${[...VALID_TYPES].join(', ')}` });
      }
      if (!VALID_PERIODS.has(period)) {
        return reply.code(400).send({ error: PERIOD_ERROR });
      }

      const [rows, sites] = await Promise.all([
        getBreakdown(req.params.id, period, type),
        getSites(),
      ]);

      const site = sites.find(s => s.id === req.params.id);
      const domain = site?.domain ?? req.params.id;
      const label = TYPE_LABELS[type];
      const formatted = formatBreakdown(domain, rows, label, period);

      return {
        summary: formatted.summary,
        data: { domain, type, period, rows },
        context_for_agent: formatted.context_for_agent,
      };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { period?: string } }>(
    '/v1/sites/:id/time',
    { preHandler: requireApiKey },
    async (req, reply) => {
      const period = (req.query.period ?? '7d') as Period;
      if (!VALID_PERIODS.has(period)) {
        return reply.code(400).send({ error: PERIOD_ERROR });
      }

      const [stats, sites] = await Promise.all([
        getStats(req.params.id, period),
        getSites(),
      ]);

      const site = sites.find(s => s.id === req.params.id);
      const domain = site?.domain ?? req.params.id;
      const formatted = formatAvgTime(domain, stats.totaltime, stats.visits, period);

      return {
        summary: formatted.summary,
        data: {
          domain,
          period,
          totaltime: stats.totaltime,
          visits: stats.visits,
          avgSeconds: stats.visits > 0 ? Math.round(stats.totaltime / stats.visits) : 0,
        },
        context_for_agent: formatted.context_for_agent,
      };
    }
  );
}
