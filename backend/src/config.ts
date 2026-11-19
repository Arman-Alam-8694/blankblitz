/**
 * Centralised, validated runtime configuration (12-factor: everything via env vars).
 */
import { z } from 'zod';

const bool = z
  .enum(['0', '1', 'true', 'false'])
  .transform((v) => v === '1' || v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  /** Comma-separated list of allowed browser origins (only needed when the frontend is hosted elsewhere). */
  CORS_ORIGINS: z.string().default(''),
  /** Set when running behind a reverse proxy / PaaS load balancer so client IPs are read from X-Forwarded-For. */
  TRUST_PROXY: bool.default(false),
  MAX_ROOMS: z.coerce.number().int().min(1).default(5000),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).default(20),
  /** Burst of room joins/creates allowed per IP (refills at 1 per 2s). Deters room-code scanning. */
  JOIN_BURST_PER_IP: z.coerce.number().int().min(1).default(15),
  /** Seconds a disconnected player keeps their seat. */
  RECONNECT_GRACE_SEC: z.coerce.number().int().min(5).default(60),
  /** Seconds an empty room survives before cleanup. */
  EMPTY_ROOM_TTL_SEC: z.coerce.number().int().min(5).default(120),
  /** Multiplier for bot think-time (tests use a small value). */
  BOT_SPEED: z.coerce.number().min(0.01).max(50).default(1),
  /** Multiplier for inter-phase pauses (countdown, round end). */
  PAUSE_SCALE: z.coerce.number().min(0).max(10).default(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // ── Voice ───────────────────────────────────────────────────────────────
  /** Public STUN servers (free) used for NAT traversal. Comma-separated. */
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478'),
  /** Optional TURN servers, e.g. "turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tcp". */
  TURN_URLS: z.string().default(''),
  /** coturn "use-auth-secret" shared secret → short-lived per-player credentials (recommended). */
  TURN_SECRET: z.string().default(''),
  /** Alternative: static TURN credentials (e.g. a free hosted TURN tier). */
  TURN_USERNAME: z.string().default(''),
  TURN_CREDENTIAL: z.string().default(''),
  TURN_TTL_SEC: z.coerce.number().int().min(60).default(6 * 3600),
  /** Server-side audio relay over WebSocket as the last-resort fallback. */
  VOICE_RELAY: bool.default(true),
  /** Skip P2P entirely and relay all audio through the server (ops switch / debugging). */
  VOICE_FORCE_RELAY: bool.default(false),
  // ── Sign-in (optional) ──────────────────────────────────────────────────
  /** Google OAuth "Web application" client ID. Empty = Google sign-in hidden. */
  GOOGLE_CLIENT_ID: z.string().default(''),
  /** HMAC secret for app profile tokens. Empty = random per process (sign-ins reset on restart). */
  AUTH_SECRET: z.string().default(''),
  /** Days a sign-in stays valid on a device. */
  AUTH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Path to the built frontend to serve in production. */
  STATIC_DIR: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Fail fast with a readable message rather than misbehaving later.
    console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}
