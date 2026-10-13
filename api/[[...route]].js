// Vercel adapter: optional catch-all Edge Function.
// The Hono app serves every /api/* route; static files are served by Vercel directly.
import { createApp } from '../src/app.js';

export const config = { runtime: 'edge' };

const app = createApp();

export default function handler(req) {
  return app.fetch(req);
}
