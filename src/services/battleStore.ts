import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { auth, db, handleFirestoreError, OperationType, storage } from './firebase';

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

export async function hashAdminPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`kirmizivemavi-admin-v1:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function checkDatabasePasswordStatus(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'admin_guvenlik', 'status'));
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
    getDoc(doc(db, 'admin_keys', keyHash)),
    getDoc(doc(db, 'admin_guvenlik', 'status')),
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

