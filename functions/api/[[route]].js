// Cloudflare Pages Function adapter: catches every /api/* request.
// Static files are served by Pages directly. Env vars (dashboard or wrangler)
// arrive on context.env and are read via the shared getEnv helper.
import { createApp } from '../../src/app.js';

const app = createApp();

export function onRequest(context) {
  return app.fetch(context.request, context.env, context);
}
