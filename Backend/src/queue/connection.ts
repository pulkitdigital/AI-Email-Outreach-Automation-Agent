import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// BullMQ requires maxRetriesPerRequest: null on the connection it's given.
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err: Error) => {
  console.error('[redis] connection error:', err);
});
