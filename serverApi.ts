import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type {
  ActiveBattle,
  BattleHistoryEntry,
  Country,
  InstagramSync,
  SiteSettings,
} from './src/types/battle';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFirebaseConfig(): { projectId?: string } {
  const cwdPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cwdPath)) {
    return JSON.parse(fs.readFileSync(cwdPath, 'utf-8')) as { projectId?: string };
  }
  const localPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8')) as { projectId?: string };
  }
  return { projectId: '' };
}

const firebaseConfig = loadFirebaseConfig();

const adminApp =
  firebaseConfig.projectId && firebaseConfig.projectId !== 'remixed-project-id'
    ? getApps().length
      ? getApp()
      : initializeApp({ projectId: firebaseConfig.projectId })
    : null;

const adminAuth = adminApp ? getAuth(adminApp) : null;

const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 16
    ? process.env.ADMIN_SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const ALLOWED_BOOTSTRAP_EMAIL = 'fatihckr210@gmail.com';
export const INSTAGRAM_HANDLE = 'kirmizivemavitakim';

interface StoredPassword {
  salt: string;
  hash: string;
  source: 'env' | 'claimed';
}

function hashPasswordScrypt(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPasswordScrypt(password: string, stored: StoredPassword): boolean {
  const candidate = crypto.scryptSync(password, stored.salt, 64);
  const expected = Buffer.from(stored.hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

let activeAdminPassword: StoredPassword | null = null;
if (process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim().length > 0) {
  const hashed = hashPasswordScrypt(process.env.ADMIN_INITIAL_PASSWORD.trim());
  activeAdminPassword = { ...hashed, source: 'env' };
}

const revokedTokenIds = new Set<string>();

interface SessionPayload {
  jti: string;
  uid: string;
  email: string;
  exp: number;
}

function signSessionToken(uid: string, email: string): string {
  const payload: SessionPayload = {
    jti: crypto.randomUUID(),
    uid,
    email,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf-8');
  const expBuf = Buffer.from(expectedSig, 'utf-8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionPayload;
    if (!parsed.jti || !parsed.uid || !parsed.email || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp || revokedTokenIds.has(parsed.jti)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function verifyFirebaseAdminCaller(
  idToken: string | undefined,
  allowedEmails: string[] = [ALLOWED_BOOTSTRAP_EMAIL]
): Promise<{ uid: string; email: string } | null> {
  if (!adminAuth || !idToken || typeof idToken !== 'string') return null;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.email || decoded.email_verified !== true) return null;
    const normalized = decoded.email.toLowerCase();
    const isAllowed =
      normalized === ALLOWED_BOOTSTRAP_EMAIL.toLowerCase() ||
      allowedEmails.some((e) => e.toLowerCase() === normalized);
    if (!isAllowed) return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export interface InstagramCacheState extends InstagramSync {}

let instagramCache: InstagramCacheState = {
  handle: INSTAGRAM_HANDLE,
  followers: 620,
  lastValidFollowers: 620,
  syncStatus: 'pending',
  source: 'initial',
  lastError: '',
  lastUpdatedAt: new Date(0).toISOString(),
};

let activeBattleCache: ActiveBattle = {
  homeCountryCode: 'DE',
  homeCountryName: 'Almanya',
  homeFlag: '🇩🇪',
  homeColor: '#2563EB',
  homeModel: 'heavy',
  homeSoldiers: 3000,
  homeRemaining: 3000,
  opponentCountryCode: 'TR',
  opponentCountryName: 'Türkiye',
  opponentFlag: '🇹🇷',
  opponentColor: '#DC2626',
  opponentModel: 'commando',
  opponentSoldiers: 620,
  opponentRemaining: 620,
  status: 'idle',
  wallHeight: 14,
  scheduledStartAt: '',
  winnerSide: 'none',
  winnerName: '',
  arenaTheme: 'twilight',
  battleSpeed: 1,
  soldierScale: 1,
  manualOverrideBlue: false,
  updatedAt: new Date(0).toISOString(),
};

let siteSettingsCache: SiteSettings = {
  soldiersPerFollower: 1,
  instagramHandle: INSTAGRAM_HANDLE,
  autoSyncMinutes: 5,
  arenaTheme: 'twilight',
  wallLoweringDuration: 4,
  battleSpeed: 1,
  defaultCamera: 'overview',
  updatedAt: new Date(0).toISOString(),
};

const countryOverridesCache = new Map<string, Country>();
const removedCountryCodes = new Set<string>();
const battleHistoryCache: BattleHistoryEntry[] = [];

function parseCompactFollowerCount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '').replace(/,/g, '.');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([KkMmBb])?$/);
  if (!match) {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  const num = Number.parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  const mult = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  return Math.round(num * mult);
}

async function fetchInstagramFollowersFromSource(handle: string): Promise<{ followers: number; source: string }> {
  const cleanHandle = handle.replace(/^@/, '').trim() || INSTAGRAM_HANDLE;
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();

  if (igToken) {
    const graphUrl = `https://graph.instagram.com/v21.0/me?fields=followers_count,username&access_token=${encodeURIComponent(igToken)}`;
    const res = await fetch(graphUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { followers_count?: number };
      if (typeof data.followers_count === 'number' && Number.isFinite(data.followers_count)) {
        return { followers: Math.max(0, Math.round(data.followers_count)), source: 'instagram_graph_api' };
      }
    }
  }

  try {
    const apiRes = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanHandle)}`,
      {
        headers: {
          'x-ig-app-id': '936619743392459',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (apiRes.ok) {
      const json = (await apiRes.json()) as {
        data?: { user?: { edge_followed_by?: { count?: number } } };
      };
      const count = json?.data?.user?.edge_followed_by?.count;
      if (typeof count === 'number' && Number.isFinite(count)) {
        return { followers: Math.max(0, Math.round(count)), source: 'instagram_web_profile_api' };
      }
    }
  } catch {
    // Fall through to HTML meta check
  }

  const pageRes = await fetch(`https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (pageRes.ok) {
    const html = await pageRes.text();
    const metaMatch = html.match(/content="([0-9.,KkMm]+)\s+(?:Followers|Takipçi)/i);
    if (metaMatch?.[1]) {
      const parsed = parseCompactFollowerCount(metaMatch[1]);
      if (parsed !== null) {
        return { followers: parsed, source: 'instagram_public_meta' };
      }
    }
    const jsonMatch = html.match(/"edge_followed_by":\s*\{\s*"count":\s*(\d+)/);
    if (jsonMatch?.[1]) {
      const parsed = Number.parseInt(jsonMatch[1], 10);
      if (Number.isFinite(parsed)) {
        return { followers: parsed, source: 'instagram_embedded_json' };
      }
    }
  }

  throw new Error('Instagram profil verisine şu anda erişilemiyor.');
}

export async function syncInstagramCache(handle: string, seedLastValid?: number): Promise<InstagramCacheState> {
  if (
    typeof seedLastValid === 'number' &&
    Number.isFinite(seedLastValid) &&
    seedLastValid > 0 &&
    instagramCache.syncStatus === 'pending'
  ) {
    instagramCache.lastValidFollowers = Math.round(seedLastValid);
    instagramCache.followers = Math.round(seedLastValid);
  }
  try {
    const result = await fetchInstagramFollowersFromSource(handle);
    instagramCache = {
      handle: handle.replace(/^@/, ''),
      followers: result.followers,
      lastValidFollowers: result.followers,
      syncStatus: 'ok',
      source: result.source,
      lastError: '',
      lastUpdatedAt: new Date().toISOString(),
    };
  } catch (err) {
    instagramCache = {
      ...instagramCache,
      handle: handle.replace(/^@/, ''),
      followers: instagramCache.lastValidFollowers,
      syncStatus: 'preserved_fallback',
      source: 'last_valid_cache',
      lastError: err instanceof Error ? err.message : 'Instagram API erişim hatası',
      lastUpdatedAt: new Date().toISOString(),
    };
  }
  return instagramCache;
}

export function getInstagramHandle(): string {
  return instagramCache.handle;
}

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const requireAdmin = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const authHeader = req.headers.authorization;
    const idToken = req.headers['x-firebase-id-token'];
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Yönetici oturumu gerekli.' });
      return;
    }
    const bearer = authHeader.slice(7).trim();
    const session = verifySessionToken(bearer);
    if (!session) {
      res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş.' });
      return;
    }
    if (typeof idToken === 'string' && idToken.length > 0 && session.uid !== 'admin-password') {
      const verified = await verifyFirebaseAdminCaller(idToken);
      if (!verified || verified.uid !== session.uid) {
        res.status(403).json({ error: 'Firebase yönetici doğrulaması başarısız.' });
        return;
      }
    }
    (req as express.Request & { adminSession?: SessionPayload }).adminSession = session;
    next();
  };

  app.get('/api/admin/status', (_req, res) => {
    res.json({
      needsInitialSetup: activeAdminPassword === null,
      configuredViaEnv: activeAdminPassword?.source === 'env',
      firebaseAdminReady: Boolean(adminAuth),
    });
  });

  // Password-only first-run claim (optional Firebase ID token)
  app.post('/api/admin/claim', async (req, res) => {
    if (activeAdminPassword !== null) {
      res.status(409).json({ error: 'Yönetici şifresi zaten tanımlanmış.' });
      return;
    }
    const { idToken, password, allowedEmails } = req.body as {
      idToken?: string;
      password?: string;
      allowedEmails?: string[];
    };
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Şifre en az 6, en fazla 128 karakter olmalıdır.' });
      return;
    }

    let uid = 'admin-password';
    let email = ALLOWED_BOOTSTRAP_EMAIL;
    if (typeof idToken === 'string' && idToken.length > 0) {
      const verified = await verifyFirebaseAdminCaller(
        idToken,
        Array.isArray(allowedEmails) ? allowedEmails : [ALLOWED_BOOTSTRAP_EMAIL]
      );
      if (verified) {
        uid = verified.uid;
        email = verified.email;
      }
    }

    const hashed = hashPasswordScrypt(password);
    activeAdminPassword = { ...hashed, source: 'claimed' };
    const sessionToken = signSessionToken(uid, email);
    res.json({
      ok: true,
      sessionToken,
      email,
      uid,
    });
  });

  // Password-only Admin Login (optional Firebase ID token)
  app.post('/api/admin/login', async (req, res) => {
    if (activeAdminPassword === null) {
      res.status(428).json({ error: 'İlk kurulum tamamlanmamış. Lütfen önce yönetici şifresi belirleyin.' });
      return;
    }
    const { idToken, password, allowedEmails } = req.body as {
      idToken?: string;
      password?: string;
      allowedEmails?: string[];
    };
    if (typeof password !== 'string' || password.length === 0 || !verifyPasswordScrypt(password, activeAdminPassword)) {
      res.status(401).json({ error: 'Yönetici şifresi hatalı. Erişim reddedildi.' });
      return;
    }

    let uid = 'admin-password';
    let email = ALLOWED_BOOTSTRAP_EMAIL;
    if (typeof idToken === 'string' && idToken.length > 0) {
      const verified = await verifyFirebaseAdminCaller(
        idToken,
        Array.isArray(allowedEmails) ? allowedEmails : [ALLOWED_BOOTSTRAP_EMAIL]
      );
      if (verified) {
        uid = verified.uid;
        email = verified.email;
      }
    }

    const sessionToken = signSessionToken(uid, email);
    res.json({
      ok: true,
      sessionToken,
      email,
      uid,
    });
  });

  app.get('/api/admin/verify', requireAdmin, (req, res) => {
    const session = (req as express.Request & { adminSession?: SessionPayload }).adminSession;
    res.json({ ok: true, uid: session?.uid, email: session?.email });
  });

  app.post('/api/admin/change-password', requireAdmin, (req, res) => {
    if (!activeAdminPassword) {
      res.status(400).json({ error: 'Aktif şifre bulunamadı.' });
      return;
    }
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (typeof currentPassword !== 'string' || !verifyPasswordScrypt(currentPassword, activeAdminPassword)) {
      res.status(401).json({ error: 'Mevcut şifre doğrulanamadı.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'Yeni şifre 6 ile 128 karakter arasında olmalıdır.' });
      return;
    }
    const hashed = hashPasswordScrypt(newPassword);
    activeAdminPassword = { ...hashed, source: 'claimed' };
    res.json({ ok: true, message: 'Yönetici şifresi güvenli şekilde güncellendi.' });
  });

  app.post('/api/admin/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const session = verifySessionToken(authHeader.slice(7).trim());
      if (session) {
        revokedTokenIds.add(session.jti);
      }
    }
    res.json({ ok: true });
  });

  // Public Battle, Settings, Countries & History state endpoint
  app.get('/api/battle/state', (_req, res) => {
    res.json({
      battle: activeBattleCache,
      settings: siteSettingsCache,
      instagram: instagramCache,
      countryOverrides: Array.from(countryOverridesCache.values()),
      removedCountryCodes: Array.from(removedCountryCodes),
      history: battleHistoryCache,
    });
  });

  app.put('/api/battle/active', requireAdmin, (req, res) => {
    const body = req.body as Partial<ActiveBattle>;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Geçersiz savaş verisi.' });
      return;
    }
    activeBattleCache = {
      ...activeBattleCache,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    res.json(activeBattleCache);
  });

  app.put('/api/battle/settings', requireAdmin, (req, res) => {
    const body = req.body as Partial<SiteSettings>;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Geçersiz ayar verisi.' });
      return;
    }
    siteSettingsCache = {
      ...siteSettingsCache,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    res.json(siteSettingsCache);
  });

  app.post('/api/battle/history', requireAdmin, (req, res) => {
    const body = req.body as Omit<BattleHistoryEntry, 'id'>;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Geçersiz geçmiş verisi.' });
      return;
    }
    const entry: BattleHistoryEntry = {
      ...body,
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: body.createdAt || new Date().toISOString(),
    };
    battleHistoryCache.unshift(entry);
    if (battleHistoryCache.length > 100) battleHistoryCache.length = 100;
    res.json(entry);
  });

  app.put('/api/battle/history/:id/reels', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reelsUrl, reelsPath } = req.body as { reelsUrl?: string; reelsPath?: string };
    const found = battleHistoryCache.find((h) => h.id === id);
    if (found) {
      found.reelsUrl = reelsUrl || '';
      found.reelsPath = reelsPath || '';
    }
    res.json({ ok: true });
  });

  app.put('/api/countries/:code', requireAdmin, (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase().slice(0, 12);
    const body = req.body as Country;
    if (!code || !body || typeof body.name !== 'string') {
      res.status(400).json({ error: 'Geçersiz ülke verisi.' });
      return;
    }
    const clean: Country = { ...body, code, updatedAt: new Date().toISOString() };
    countryOverridesCache.set(code, clean);
    removedCountryCodes.delete(code);
    res.json(clean);
  });

  app.delete('/api/countries/:code', requireAdmin, (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase().slice(0, 12);
    countryOverridesCache.delete(code);
    removedCountryCodes.add(code);
    res.json({ ok: true });
  });

  app.get('/api/instagram/status', (_req, res) => {
    res.json(instagramCache);
  });

  app.post('/api/instagram/sync', requireAdmin, async (req, res) => {
    const { handle, lastValidFollowers } = req.body as {
      handle?: string;
      lastValidFollowers?: number;
    };
    const cleanHandle = typeof handle === 'string' && handle.trim() ? handle.trim() : INSTAGRAM_HANDLE;
    const state = await syncInstagramCache(cleanHandle, lastValidFollowers);
    res.json(state);
  });

  app.post('/api/instagram/manual', requireAdmin, (req, res) => {
    const { followers, handle } = req.body as { followers?: number; handle?: string };
    if (
      typeof followers !== 'number' ||
      !Number.isFinite(followers) ||
      followers < 0 ||
      followers > 1_000_000_000
    ) {
      res.status(400).json({ error: 'Geçerli bir takipçi sayısı girin.' });
      return;
    }
    const rounded = Math.round(followers);
    instagramCache = {
      handle:
        typeof handle === 'string' && handle.trim()
          ? handle.replace(/^@/, '').trim()
          : instagramCache.handle,
      followers: rounded,
      lastValidFollowers: rounded,
      syncStatus: 'ok',
      source: 'admin_manual',
      lastError: '',
      lastUpdatedAt: new Date().toISOString(),
    };
    res.json(instagramCache);
  });

  return app;
}
