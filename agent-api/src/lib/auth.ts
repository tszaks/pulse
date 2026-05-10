import type { FastifyRequest, FastifyReply } from 'fastify';

const VALID_KEYS = new Set(
  (process.env.PULSE_API_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean)
);

export function requireApiKey(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const header = req.headers.authorization ?? '';
  const key = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!VALID_KEYS.has(key)) {
    reply.code(401).send({ error: 'Invalid or missing API key' });
    return;
  }
  done();
}
