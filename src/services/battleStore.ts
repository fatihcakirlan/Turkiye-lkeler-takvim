import { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { WORLD_COUNTRIES } from '../data/countries';
import {
  ActiveBattle,
  AdminUser,
  BattleHistoryEntry,
  Country,
  InstagramSync,
  SiteSettings,
} from '../types/battle';
import { auth, db, handleFirestoreError, OperationType, storage, testConnection } from './firebase';

export const DEFAULT_SETTINGS: SiteSettings = {
  soldiersPerFollower: 1,
  instagramHandle: 'kirmizivemavitakim',
  autoSyncMinutes: 5,
  arenaTheme: 'twilight',
  wallLoweringDuration: 4,
  battleSpeed: 1,
  defaultCamera: 'overview',
  updatedAt: new Date(0).toISOString(),
};

export const DEFAULT_INSTAGRAM: InstagramSync = {
  handle: 'kirmizivemavitakim',
  followers: 620,
  lastValidFollowers: 620,
  syncStatus: 'pending',
  source: 'initial',
  lastError: '',
  lastUpdatedAt: new Date(0).toISOString(),
};

export const DEFAULT_BATTLE: ActiveBattle = {
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

let activeAdminSessionToken: string | null = null;
const SYNC_CHANNEL_NAME = 'battle-arena-state-sync';
const localListeners = new Set<() => void>();

export function setAdminSessionToken(token: string | null): void {
  activeAdminSessionToken = token;
}

export function subscribeLocalSyncSignal(cb: () => void): () => void {
  localListeners.add(cb);
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    channel.onmessage = () => cb();
  }
  return () => {
    localListeners.delete(cb);
    channel?.close();
  };
}

function broadcastStateUpdated(): void {
  localListeners.forEach((cb) => cb());
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
    ch.postMessage({ ts: Date.now() });
    ch.close();
  }
}

async function adminApiFetch(url: string, method: string, body?: unknown): Promise<Response | null> {
  if (!activeAdminSessionToken) return null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${activeAdminSessionToken}`,
  };
  if (auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      headers['X-Firebase-Id-Token'] = idToken;
    } catch {
      // Optional Firebase token
    }
  }
  return fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'id';
}

function clampNum(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

function clampStr(val: string | undefined, max: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.trim().slice(0, max);
}

function safeHex(val: string | undefined, fallback: string): string {
  if (typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim())) {
    return val.trim();
  }
  return fallback;
}

export interface ServerStateSnapshot {
  battle: ActiveBattle;
  settings: SiteSettings;
  instagram: InstagramSync;
  countryOverrides: Country[];
  removedCountryCodes: string[];
  history: BattleHistoryEntry[];
}

async function safeReadJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function fetchServerBattleState(): Promise<ServerStateSnapshot | null> {
  try {
    const res = await fetch('/api/battle/state');
    if (!res.ok) return null;
    return await safeReadJson<ServerStateSnapshot>(res);
  } catch {
    return null;
  }
}

export function subscribePublicBattleState(callbacks: {
  onBattle: (battle: ActiveBattle) => void;
  onSettings: (settings: SiteSettings) => void;
  onInstagram: (ig: InstagramSync) => void;
  onCountries: (countries: Country[]) => void;
  onHistory: (history: BattleHistoryEntry[]) => void;
}): () => void {
  const unsubBattle = onSnapshot(
    doc(db, 'savaslar', 'active'),
    (snap) => {
      if (snap.exists()) {
        callbacks.onBattle({ ...DEFAULT_BATTLE, ...(snap.data() as Partial<ActiveBattle>) });
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'savaslar/active');
    }
  );

  const unsubSettings = onSnapshot(
    doc(db, 'ayarlar', 'global'),
    (snap) => {
      if (snap.exists()) {
        callbacks.onSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<SiteSettings>) });
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'ayarlar/global');
    }
  );

  const unsubIg = onSnapshot(
    doc(db, 'instagram', 'kirmizivemavitakim'),
    (snap) => {
      if (snap.exists()) {
        callbacks.onInstagram({ ...DEFAULT_INSTAGRAM, ...(snap.data() as Partial<InstagramSync>) });
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'instagram/kirmizivemavitakim');
    }
  );

  const unsubCountries = onSnapshot(
    collection(db, 'ulkeler'),
    (snap) => {
      const overrideMap = new Map<string, Country>();
      snap.forEach((d) => {
        const data = d.data() as Country;
        overrideMap.set(data.code, data);
      });
      const merged = WORLD_COUNTRIES.map((c) => overrideMap.get(c.code) ?? c);
      overrideMap.forEach((c, code) => {
        if (!WORLD_COUNTRIES.some((w) => w.code === code)) {
          merged.unshift(c);
        }
      });
      callbacks.onCountries(merged);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'ulkeler');
    }
  );

  const unsubHistory = onSnapshot(
    query(collection(db, 'battle_history'), orderBy('createdAt', 'desc')),
    (snap) => {
      const list: BattleHistoryEntry[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as BattleHistoryEntry) });
      });
      if (list.length > 0) {
        callbacks.onHistory(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'battle_history');
    }
  );

  return () => {
    unsubBattle();
    unsubSettings();
    unsubIg();
    unsubCountries();
    unsubHistory();
  };
}

export function subscribeAdmins(onAdmins: (admins: AdminUser[]) => void): () => void {
  if (!auth.currentUser) {
    onAdmins([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'adminler'),
    (snap) => {
      const list: AdminUser[] = [];
      snap.forEach((d) => {
        list.push(d.data() as AdminUser);
      });
      onAdmins(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'adminler');
    }
  );
}

export async function saveActiveBattle(battle: ActiveBattle): Promise<void> {
  const payload: ActiveBattle = {
    homeCountryCode: sanitizeId(battle.homeCountryCode),
    homeCountryName: clampStr(battle.homeCountryName, 80, 'Almanya'),
    homeFlag: clampStr(battle.homeFlag, 32, '🇩🇪'),
    homeColor: safeHex(battle.homeColor, '#2563EB'),
    homeModel: battle.homeModel,
    homeSoldiers: Math.round(clampNum(battle.homeSoldiers, 0, 100000000)),
    homeRemaining: Math.round(clampNum(battle.homeRemaining, 0, 100000000)),
    opponentCountryCode: sanitizeId(battle.opponentCountryCode),
    opponentCountryName: clampStr(battle.opponentCountryName, 80, 'Türkiye'),
    opponentFlag: clampStr(battle.opponentFlag, 32, '🇹🇷'),
    opponentColor: safeHex(battle.opponentColor, '#DC2626'),
    opponentModel: battle.opponentModel,
    opponentSoldiers: Math.round(clampNum(battle.opponentSoldiers, 0, 100000000)),
    opponentRemaining: Math.round(clampNum(battle.opponentRemaining, 0, 100000000)),
    status: battle.status,
    wallHeight: clampNum(battle.wallHeight, 0, 50),
    scheduledStartAt: clampStr(battle.scheduledStartAt, 64, ''),
    winnerSide: battle.winnerSide,
    winnerName: clampStr(battle.winnerName, 80, ''),
    arenaTheme: battle.arenaTheme,
    battleSpeed: clampNum(battle.battleSpeed, 0.25, 5),
    soldierScale: clampNum(battle.soldierScale ?? 1, 0.5, 2),
    manualOverrideBlue: Boolean(battle.manualOverrideBlue),
    updatedAt: new Date().toISOString(),
  };

  await adminApiFetch('/api/battle/active', 'PUT', payload);
  broadcastStateUpdated();

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'savaslar', 'active'), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'savaslar/active');
    }
  }
}

export async function saveCountry(country: Country): Promise<void> {
  const code = sanitizeId(country.code);
  const payload: Country = {
    code,
    name: clampStr(country.name, 80, 'Ülke'),
    flag: clampStr(country.flag, 32, '🏳️'),
    soldierCount: Math.round(clampNum(country.soldierCount, 0, 100000000)),
    color: safeHex(country.color, '#DC2626'),
    modelType: country.modelType,
    imageUrl: clampStr(country.imageUrl, 512, ''),
    isCustom: Boolean(country.isCustom),
    updatedAt: new Date().toISOString(),
  };

  await adminApiFetch(`/api/countries/${encodeURIComponent(code)}`, 'PUT', payload);
  broadcastStateUpdated();

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'ulkeler', code), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `ulkeler/${code}`);
    }
  }
}

export async function removeCountry(code: string): Promise<void> {
  const id = sanitizeId(code);
  await adminApiFetch(`/api/countries/${encodeURIComponent(id)}`, 'DELETE');
  broadcastStateUpdated();

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'ulkeler', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `ulkeler/${id}`);
    }
  }
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  const payload: SiteSettings = {
    soldiersPerFollower: Math.round(clampNum(settings.soldiersPerFollower, 1, 1000)),
    instagramHandle: clampStr(settings.instagramHandle, 64, 'kirmizivemavitakim'),
    autoSyncMinutes: Math.round(clampNum(settings.autoSyncMinutes, 1, 1440)),
    arenaTheme: settings.arenaTheme,
    wallLoweringDuration: clampNum(settings.wallLoweringDuration, 1, 20),
    battleSpeed: clampNum(settings.battleSpeed, 0.25, 5),
    defaultCamera: settings.defaultCamera,
    updatedAt: new Date().toISOString(),
  };

  await adminApiFetch('/api/battle/settings', 'PUT', payload);
  broadcastStateUpdated();

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'ayarlar', 'global'), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'ayarlar/global');
    }
  }
}

export async function saveInstagramSync(sync: InstagramSync): Promise<void> {
  const payload: InstagramSync = {
    handle: clampStr(sync.handle, 64, 'kirmizivemavitakim'),
    followers: Math.round(clampNum(sync.followers, 0, 1000000000)),
    lastValidFollowers: Math.round(clampNum(sync.lastValidFollowers, 0, 1000000000)),
    syncStatus: sync.syncStatus,
    source: clampStr(sync.source, 64, 'api'),
    lastError: clampStr(sync.lastError, 240, ''),
    lastUpdatedAt: sync.lastUpdatedAt || new Date().toISOString(),
  };

  broadcastStateUpdated();

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'instagram', 'kirmizivemavitakim'), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'instagram/kirmizivemavitakim');
    }
  }
}

export async function addBattleHistory(entry: Omit<BattleHistoryEntry, 'id'>): Promise<string> {
  const payload: Omit<BattleHistoryEntry, 'id'> = {
    homeCountryCode: sanitizeId(entry.homeCountryCode),
    homeCountryName: clampStr(entry.homeCountryName, 80, 'Almanya'),
    homeFlag: clampStr(entry.homeFlag, 32, '🇩🇪'),
    homeSoldiersStart: Math.round(clampNum(entry.homeSoldiersStart, 0, 100000000)),
    homeSoldiersEnd: Math.round(clampNum(entry.homeSoldiersEnd, 0, 100000000)),
    opponentCountryCode: sanitizeId(entry.opponentCountryCode),
    opponentCountryName: clampStr(entry.opponentCountryName, 80, 'Türkiye'),
    opponentFlag: clampStr(entry.opponentFlag, 32, '🇹🇷'),
    opponentSoldiersStart: Math.round(clampNum(entry.opponentSoldiersStart, 0, 100000000)),
    opponentSoldiersEnd: Math.round(clampNum(entry.opponentSoldiersEnd, 0, 100000000)),
    winnerSide: entry.winnerSide,
    winnerName: clampStr(entry.winnerName, 80, 'Berabere'),
    durationSeconds: Math.round(clampNum(entry.durationSeconds, 0, 86400)),
    reelsUrl: clampStr(entry.reelsUrl, 1024, ''),
    reelsPath: clampStr(entry.reelsPath, 256, ''),
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  let createdId = `hist_${Date.now()}`;
  const res = await adminApiFetch('/api/battle/history', 'POST', payload);
  if (res && res.ok) {
    const data = await safeReadJson<{ id?: string }>(res);
    if (data?.id) createdId = data.id;
  }
  broadcastStateUpdated();

  if (auth.currentUser) {
    try {
      const docRef = await addDoc(collection(db, 'battle_history'), payload);
      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'battle_history');
    }
  }
  return createdId;
}

export async function updateBattleHistoryReels(
  id: string,
  reelsUrl: string,
  reelsPath: string
): Promise<void> {
  const safeId = sanitizeId(id);
  await adminApiFetch(`/api/battle/history/${encodeURIComponent(safeId)}/reels`, 'PUT', {
    reelsUrl: clampStr(reelsUrl, 1024, ''),
    reelsPath: clampStr(reelsPath, 256, ''),
  });
  broadcastStateUpdated();

  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, 'battle_history', safeId), {
        reelsUrl: clampStr(reelsUrl, 1024, ''),
        reelsPath: clampStr(reelsPath, 256, ''),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `battle_history/${safeId}`);
    }
  }
}

export async function saveAdminRecord(admin: AdminUser): Promise<void> {
  if (!auth.currentUser) return;
  const uid = sanitizeId(admin.uid);
  const now = new Date().toISOString();
  const payload: AdminUser = {
    uid,
    email: clampStr(admin.email, 180),
    displayName: clampStr(admin.displayName, 80, 'Yönetici'),
    role: admin.role,
    createdAt: admin.createdAt || now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'adminler', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `adminler/${uid}`);
  }
}

export async function deleteAdminRecord(uid: string): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = sanitizeId(uid);
  try {
    await deleteDoc(doc(db, 'adminler', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `adminler/${safeId}`);
  }
}

export async function uploadReelsToStorage(
  blob: Blob,
  fileName: string
): Promise<{ url: string; path: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `reels/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, {
    contentType: blob.type || 'video/mp4',
  });
  const url = await getDownloadURL(storageRef);
  return { url, path: storagePath };
}

function sha256PureJs(bytes: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H)
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

export async function hashAdminPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`kirmizivemavi-admin-v1:${password}`);
  if (globalThis.crypto?.subtle) {
    try {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback for non-HTTPS contexts
    }
  }
  return sha256PureJs(data);
}

async function readDocFresh(docRef: ReturnType<typeof doc>) {
  try {
    return await getDocFromServer(docRef);
  } catch {
    return await getDoc(docRef);
  }
}

export async function checkFirestoreAdminConnection(): Promise<{
  firestoreConnected: boolean;
  hasDatabasePassword: boolean;
}> {
  const [connected, statusSnap] = await Promise.all([
    testConnection().catch(() => false),
    readDocFresh(doc(db, 'admin_guvenlik', 'status')).catch(() => null),
  ]);
  const hasDatabasePassword = Boolean(statusSnap?.exists() && statusSnap.data()?.hasDatabasePassword);
  return {
    firestoreConnected: connected || Boolean(statusSnap),
    hasDatabasePassword,
  };
}

export async function checkDatabasePasswordStatus(): Promise<boolean> {
  try {
    const snap = await readDocFresh(doc(db, 'admin_guvenlik', 'status'));
    if (!snap.exists()) return false;
    return Boolean(snap.data()?.hasDatabasePassword);
  } catch {
    return false;
  }
}

export async function verifyAdminPasswordInDatabase(password: string): Promise<{
  matched: boolean;
  keyHash: string;
  hasDatabasePassword: boolean;
}> {
  const keyHash = await hashAdminPassword(password);
  const [keyRes, statusRes] = await Promise.allSettled([
    readDocFresh(doc(db, 'admin_keys', keyHash)),
    readDocFresh(doc(db, 'admin_guvenlik', 'status')),
  ]);
  const matched = keyRes.status === 'fulfilled' && keyRes.value.exists();
  const statusFlag =
    statusRes.status === 'fulfilled' &&
    statusRes.value.exists() &&
    Boolean(statusRes.value.data()?.hasDatabasePassword);
  return {
    matched,
    keyHash,
    hasDatabasePassword: matched || statusFlag,
  };
}

export async function verifyFirebaseAdminUser(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === 'fatihckr210@gmail.com') return true;
  try {
    const adminSnap = await readDocFresh(doc(db, 'adminler', sanitizeId(user.uid)));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export async function saveAdminPasswordToDatabase(
  newPassword: string,
  oldPassword?: string
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Şifreyi veritabanına kaydetmek için Google hesabınızla bulut bağlantısını açın.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
    throw new Error('Şifre en az 6, en fazla 128 karakter olmalıdır.');
  }

  const newHash = await hashAdminPassword(newPassword);
  const now = new Date().toISOString();

  try {
    const existingSnap = await getDoc(doc(db, 'admin_keys', newHash));
    if (existingSnap.exists()) {
      await updateDoc(doc(db, 'admin_keys', newHash), {
        label: 'primary',
        updatedAt: now,
      });
    } else {
      await setDoc(doc(db, 'admin_keys', newHash), {
        keyHash: newHash,
        label: 'primary',
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });
    }

    await setDoc(doc(db, 'admin_guvenlik', 'status'), {
      hasDatabasePassword: true,
      updatedBy: user.uid,
      updatedAt: now,
    });

    if (oldPassword && oldPassword.length > 0) {
      const oldHash = await hashAdminPassword(oldPassword);
      if (oldHash !== newHash) {
        await deleteDoc(doc(db, 'admin_keys', oldHash)).catch(() => {});
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'admin_keys');
  }

  return newHash;
}

