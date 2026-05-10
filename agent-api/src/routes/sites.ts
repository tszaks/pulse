import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../lib/auth.js';
import { getSites } from '../lib/umami-client.js';

export async function sitesRoutes(app: FastifyInstance) {
  app.get('/v1/sites', { preHandler: requireApiKey }, async () => {
    const sites = await getSites();
    return { sites: sites.map(s => ({ id: s.id, name: s.name, domain: s.domain })) };
  });
}
