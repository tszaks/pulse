import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { healthRoutes } from './routes/health';
import { sitesRoutes } from './routes/sites';
import { metricsRoutes } from './routes/metrics';
import { insightsRoutes } from './routes/insights';
import { anomaliesRoutes } from './routes/anomalies';
import { queryRoutes } from './routes/query';

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors);
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

  await app.register(healthRoutes);
  await app.register(sitesRoutes);
  await app.register(metricsRoutes);
  await app.register(insightsRoutes);
  await app.register(anomaliesRoutes);
  await app.register(queryRoutes);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
}

start().catch(err => { console.error(err); process.exit(1); });
