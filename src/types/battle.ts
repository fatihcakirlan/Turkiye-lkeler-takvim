export type SoldierModelType = 'infantry' | 'commando' | 'heavy' | 'guard';
export type BattleStatus = 'idle' | 'countdown' | 'wall_lowering' | 'fighting' | 'finished';
export type WinnerSide = 'none' | 'home' | 'opponent' | 'draw';
export type ArenaTheme = 'twilight' | 'desert' | 'alpine';
export type CameraPreset = 'overview' | 'red' | 'blue' | 'cinematic';

export interface Country {
  code: string;
  name: string;
  flag: string;
  soldierCount: number;
  color: string;
  modelType: SoldierModelType;
  imageUrl?: string;
  isCustom?: boolean;
  updatedAt: string;
}

export interface ActiveBattle {
  homeCountryCode: string;
  homeCountryName: string;
  homeFlag: string;
  homeColor: string;
  homeModel: SoldierModelType;
  homeSoldiers: number;
  homeRemaining: number;
  opponentCountryCode: string;
  opponentCountryName: string;
  opponentFlag: string;
  opponentColor: string;
  opponentModel: SoldierModelType;
  opponentSoldiers: number;
  opponentRemaining: number;
  status: BattleStatus;
  wallHeight: number;
  scheduledStartAt?: string;
  winnerSide: WinnerSide;
  winnerName?: string;
  arenaTheme: ArenaTheme;
  battleSpeed: number;
  soldierScale?: number;
  manualOverrideBlue: boolean;
  updatedAt: string;
}

export interface SiteSettings {
  soldiersPerFollower: number;
  instagramHandle: string;
  autoSyncMinutes: number;
  arenaTheme: ArenaTheme;
  wallLoweringDuration: number;
  battleSpeed: number;
  defaultCamera: CameraPreset;
  updatedAt: string;
}

export interface InstagramSync {
  handle: string;
  followers: number;
  lastValidFollowers: number;
  syncStatus: 'ok' | 'preserved_fallback' | 'pending';
  source?: string;
  lastError?: string;
  lastUpdatedAt: string;
}

export interface BattleHistoryEntry {
  id?: string;
  homeCountryCode: string;
  homeCountryName: string;
  homeFlag: string;
  homeSoldiersStart: number;
  homeSoldiersEnd: number;
  opponentCountryCode: string;
  opponentCountryName: string;
  opponentFlag: string;
  opponentSoldiersStart: number;
  opponentSoldiersEnd: number;
  winnerSide: 'home' | 'opponent' | 'draw';
  winnerName: string;
  durationSeconds: number;
  reelsUrl?: string;
  reelsPath?: string;
  createdAt: string;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  role: 'superadmin' | 'admin';
  createdAt: string;
  updatedAt: string;
}
