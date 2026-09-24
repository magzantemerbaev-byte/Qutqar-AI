import 'dotenv/config';

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

const provider = (env('AI_PROVIDER', 'openai') === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic';
const defaultUrl = provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
const model = env('AI_MODEL');

export const config = {
  version: '0.2.0',
  port: Number(env('PORT', '8787')) || 8787,
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  ai: {
    provider,
    apiKey: env('AI_API_KEY'),
    apiUrl: (env('AI_API_URL') || defaultUrl).replace(/\/$/, ''),
    model,
    visionModel: env('AI_VISION_MODEL') || model,
    timeoutMs: Number(env('AI_TIMEOUT_MS', '45000')) || 45000,
    forceMock: env('AI_MOCK') === 'true',
  },
  vision: {
    provider: env('VISION_PROVIDER', 'llm') === 'http' ? ('http' as const) : ('llm' as const),
    apiUrl: env('VISION_API_URL'),
  },
  embeddings: {
    model: env('EMBEDDING_MODEL'),
    apiUrl: (env('EMBEDDING_API_URL') || env('AI_API_URL') || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: env('EMBEDDING_API_KEY') || env('AI_API_KEY'),
    minScore: env('RAG_MIN_SCORE') ? Number(env('RAG_MIN_SCORE')) : null,
  },
  kb: {
    dir: env('KB_DATA_DIR', './data'),
    includeDemo: env('KB_INCLUDE_DEMO', 'true') !== 'false',
    adminToken: env('KB_ADMIN_TOKEN'),
    maxUploadMb: Number(env('KB_MAX_UPLOAD_MB', '20')) || 20,
  },
  data: { url: env('OPERATIONAL_DATA_URL'), token: env('OPERATIONAL_DATA_TOKEN') },
  rateLimitPerMin: Number(env('RATE_LIMIT_PER_MIN', '60')) || 60,
  serveStatic: env('SERVE_STATIC'),
};

/** true — ответы формирует реальная модель; false — mock-режим */
export const aiLive = () => Boolean(config.ai.apiKey && config.ai.model && !config.ai.forceMock);
export const visionLive = () =>
  config.vision.provider === 'http' ? Boolean(config.vision.apiUrl) && !config.ai.forceMock : aiLive() && Boolean(config.ai.visionModel);
