import React, { useEffect, useMemo, useRef, useState } from 'react';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import {
  Activity,
  Clock,
  Film,
  Flag,
  Globe,
  History,
  Instagram,
  KeyRound,
  Lock,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sliders,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { FEATURED_COUNTRY_CODES, MODEL_TYPE_LABELS } from '../data/countries';
import {
  addBattleHistory,
  DEFAULT_BATTLE,
  DEFAULT_INSTAGRAM,
  deleteAdminRecord,
  removeCountry,
  saveActiveBattle,
  saveAdminRecord,
  saveCountry,
  saveInstagramSync,
  saveSiteSettings,
  setAdminSessionToken,
  subscribeAdmins,
} from '../services/battleStore';
import { auth, googleProvider } from '../services/firebase';
import {
  ActiveBattle,
  AdminUser,
  ArenaTheme,
  BattleHistoryEntry,
  CameraPreset,
  Country,
  InstagramSync,
  SiteSettings,
  SoldierModelType,
} from '../types/battle';
import { CountryFlag } from './CountryFlag';
import { ReelsStudio } from './ReelsStudio';

interface AdminPanelProps {
  battle: ActiveBattle;
  settings: SiteSettings;
  instagram: InstagramSync;
  countries: Country[];
  history: BattleHistoryEntry[];
  firebaseUser: User | null;
}

type AdminTab = 'control' | 'countries' | 'instagram' | 'history' | 'reels' | 'security';
type MobileControlSection = 'all' | 'red' | 'blue' | 'settings';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  battle,
  settings,
  instagram,
  countries,
  history,
  firebaseUser,
}) => {
  // Auth & Server Session State (kept strictly in React memory)
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [needsInitialSetup, setNeedsInitialSetup] = useState<boolean>(false);
  const [configuredViaEnv, setConfiguredViaEnv] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard State
  const [activeTab, setActiveTab] = useState<AdminTab>('control');
  const [mobileControlSection, setMobileControlSection] = useState<MobileControlSection>('all');
  const [toast, setToast] = useState<string>('');
  const [admins, setAdmins] = useState<AdminUser[]>([]);

  // Battle Control Form State
  const [homeSearch, setHomeSearch] = useState('');
  const [oppSearch, setOppSearch] = useState('');
  const [opponentSoldiersDraft, setOpponentSoldiersDraft] = useState<number>(battle.opponentSoldiers);
  const [opponentRemainingDraft, setOpponentRemainingDraft] = useState<number>(battle.opponentRemaining);
  const [opponentModelDraft, setOpponentModelDraft] = useState<SoldierModelType>(battle.opponentModel);
  const [opponentColorDraft, setOpponentColorDraft] = useState<string>(battle.opponentColor);
  const [manualBlueSoldiersDraft, setManualBlueSoldiersDraft] = useState<number>(battle.homeSoldiers);
  const [homeRemainingDraft, setHomeRemainingDraft] = useState<number>(battle.homeRemaining);
  const [homeModelDraft, setHomeModelDraft] = useState<SoldierModelType>(battle.homeModel);
  const [homeColorDraft, setHomeColorDraft] = useState<string>(battle.homeColor);
  const [manualBlueEnabled, setManualBlueEnabled] = useState<boolean>(battle.manualOverrideBlue);
  const [manualFollowersDraft, setManualFollowersDraft] = useState<number>(instagram.lastValidFollowers);
  const [scheduledDraft, setScheduledDraft] = useState<string>(battle.scheduledStartAt || '');
  const [soldiersPerFollowerDraft, setSoldiersPerFollowerDraft] = useState<number>(settings.soldiersPerFollower);
  const [battleSpeedDraft, setBattleSpeedDraft] = useState<number>(battle.battleSpeed);
  const [soldierScaleDraft, setSoldierScaleDraft] = useState<number>(battle.soldierScale ?? 1);
  const [arenaThemeDraft, setArenaThemeDraft] = useState<ArenaTheme>(battle.arenaTheme);
  const [wallDurationDraft, setWallDurationDraft] = useState<number>(settings.wallLoweringDuration);
  const [defaultCamDraft, setDefaultCamDraft] = useState<CameraPreset>(settings.defaultCamera);

  // Country Editor State
  const [countrySearch, setCountrySearch] = useState('');
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [newCountryForm, setNewCountryForm] = useState<{
    code: string;
    name: string;
    flag: string;
    soldierCount: number;
    color: string;
    modelType: SoldierModelType;
  }>({
    code: '',
    name: '',
    flag: '🏳️',
    soldierCount: 1500,
    color: '#DC2626',
    modelType: 'infantry',
  });

  // Security State
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);

  const battleTickerRef = useRef<number | null>(null);
  const battleStartTimeRef = useRef<number>(Date.now());
  const battleRef = useRef<ActiveBattle>(battle);
  battleRef.current = battle;

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((curr) => (curr === msg ? '' : curr)), 4000);
  };

  useEffect(() => {
    setOpponentSoldiersDraft(battle.opponentSoldiers);
    setOpponentRemainingDraft(battle.opponentRemaining);
    setOpponentModelDraft(battle.opponentModel);
    setOpponentColorDraft(battle.opponentColor);
    setManualBlueSoldiersDraft(battle.homeSoldiers);
    setHomeRemainingDraft(battle.homeRemaining);
    setHomeModelDraft(battle.homeModel);
    setHomeColorDraft(battle.homeColor);
    setManualBlueEnabled(battle.manualOverrideBlue);
    setScheduledDraft(battle.scheduledStartAt || '');
    setBattleSpeedDraft(battle.battleSpeed);
    setSoldierScaleDraft(battle.soldierScale ?? 1);
    setArenaThemeDraft(battle.arenaTheme);
  }, [battle]);

  useEffect(() => {
    setManualFollowersDraft(instagram.lastValidFollowers);
  }, [instagram.lastValidFollowers]);

  useEffect(() => {
    setSoldiersPerFollowerDraft(settings.soldiersPerFollower);
    setWallDurationDraft(settings.wallLoweringDuration);
    setDefaultCamDraft(settings.defaultCamera);
  }, [settings]);

  // Check server admin setup status
  useEffect(() => {
    fetch('/api/admin/status')
      .then((r) => r.json())
      .then((data: { needsInitialSetup?: boolean; configuredViaEnv?: boolean }) => {
        setNeedsInitialSetup(Boolean(data.needsInitialSetup));
        setConfiguredViaEnv(Boolean(data.configuredViaEnv));
      })
      .catch(() => {});
  }, []);

  // Subscribe to adminler when Firebase account is optionally linked
  useEffect(() => {
    if (!sessionToken || !firebaseUser) {
      setAdmins([]);
      return;
    }
    const unsub = subscribeAdmins(setAdmins);
    return () => unsub();
  }, [sessionToken, firebaseUser]);

  // Admin-driven live combat progression loop (single authoritative writer when battle is fighting)
  useEffect(() => {
    if (!sessionToken) return;
    if (battle.status !== 'fighting') {
      if (battleTickerRef.current) {
        window.clearInterval(battleTickerRef.current);
        battleTickerRef.current = null;
      }
      return;
    }

    battleStartTimeRef.current = Date.now();
    let localRed = battle.opponentRemaining;
    let localBlue = battle.homeRemaining;

    battleTickerRef.current = window.setInterval(async () => {
      const curr = battleRef.current;
      if (curr.status !== 'fighting') return;

      const bluePow = Math.max(1, localBlue);
      const redPow = Math.max(1, localRed);
      const stepRate = Math.max(15, (curr.homeSoldiers + curr.opponentSoldiers) * 0.045) * (curr.battleSpeed || 1);
      localRed = Math.max(0, Math.round(localRed - (bluePow / (bluePow + redPow)) * stepRate));
      localBlue = Math.max(0, Math.round(localBlue - (redPow / (bluePow + redPow)) * stepRate));

      if (localRed <= 0 || localBlue <= 0) {
        if (battleTickerRef.current) {
          window.clearInterval(battleTickerRef.current);
          battleTickerRef.current = null;
        }
        const winnerSide: 'home' | 'opponent' | 'draw' =
          localRed <= 0 && localBlue <= 0 ? 'draw' : localRed <= 0 ? 'home' : 'opponent';
        const winnerName =
          winnerSide === 'home'
            ? curr.homeCountryName
            : winnerSide === 'opponent'
            ? curr.opponentCountryName
            : 'Berabere';

        await saveActiveBattle({
          ...curr,
          homeRemaining: localBlue,
          opponentRemaining: localRed,
          status: 'finished',
          winnerSide,
          winnerName,
          wallHeight: 0,
        });

        const durationSeconds = Math.max(1, Math.round((Date.now() - battleStartTimeRef.current) / 1000));
        await addBattleHistory({
          homeCountryCode: curr.homeCountryCode,
          homeCountryName: curr.homeCountryName,
          homeFlag: curr.homeFlag,
          homeSoldiersStart: curr.homeSoldiers,
          homeSoldiersEnd: localBlue,
          opponentCountryCode: curr.opponentCountryCode,
          opponentCountryName: curr.opponentCountryName,
          opponentFlag: curr.opponentFlag,
          opponentSoldiersStart: curr.opponentSoldiers,
          opponentSoldiersEnd: localRed,
          winnerSide,
          winnerName,
          durationSeconds,
          createdAt: new Date().toISOString(),
        });
        notify(`Savaş tamamlandı: ${winnerName} kazandı!`);
      } else {
        await saveActiveBattle({
          ...curr,
          homeRemaining: localBlue,
          opponentRemaining: localRed,
        });
      }
    }, 1000);

    return () => {
      if (battleTickerRef.current) {
        window.clearInterval(battleTickerRef.current);
        battleTickerRef.current = null;
      }
    };
  }, [battle.status, sessionToken]);

  const handleFirebaseSignIn = async () => {
    setAuthError('');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user && sessionToken) {
        await saveAdminRecord({
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || 'Yönetici',
          role: 'superadmin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
        notify('Firebase bulut senkronizasyonu bağlandı.');
      }
    } catch (err) {
      const msg =
        err instanceof Error ? `Firebase giriş hatası: ${err.message}` : 'Firebase doğrulaması başarısız.';
      setAuthError(msg);
      if (sessionToken) notify(msg);
    }
  };

  const handleAdminAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (needsInitialSetup && passwordInput !== confirmPasswordInput) {
      setAuthError('Şifreler birbiriyle eşleşmiyor.');
      return;
    }
    setAuthLoading(true);
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken(true).catch(() => undefined) : undefined;
      const endpoint = needsInitialSetup ? '/api/admin/claim' : '/api/admin/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(idToken ? { idToken } : {}),
          password: passwordInput,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; sessionToken?: string; error?: string };
      if (!res.ok || !data.sessionToken) {
        setAuthError(data.error || 'Yönetici doğrulaması başarısız.');
        return;
      }
      setAdminSessionToken(data.sessionToken);
      setSessionToken(data.sessionToken);
      setNeedsInitialSetup(false);
      setPasswordInput('');
      setConfirmPasswordInput('');

      // Optionally sync admin record if Firebase Auth is signed in
      if (firebaseUser) {
        await saveAdminRecord({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Yönetici',
          role: 'superadmin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sunucu bağlantı hatası.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setAdminSessionToken(null);
    if (sessionToken) {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(() => {});
    }
    setSessionToken(null);
    setPasswordInput('');
    if (firebaseUser) {
      await signOut(auth).catch(() => {});
    }
  };

  const computedAutoRedSoldiers = useMemo(() => {
    return Math.max(0, instagram.lastValidFollowers * soldiersPerFollowerDraft);
  }, [instagram.lastValidFollowers, soldiersPerFollowerDraft]);

  const filteredHomeCountries = useMemo(() => {
    const q = homeSearch.trim().toLowerCase();
    const list = q
      ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      : countries;
    return [...list].sort((a, b) => {
      const ai = FEATURED_COUNTRY_CODES.indexOf(a.code);
      const bi = FEATURED_COUNTRY_CODES.indexOf(b.code);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name, 'tr');
    });
  }, [countries, homeSearch]);

  const filteredOppCountries = useMemo(() => {
    const q = oppSearch.trim().toLowerCase();
    const list = q
      ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      : countries;
    return [...list].sort((a, b) => {
      const ai = FEATURED_COUNTRY_CODES.indexOf(a.code);
      const bi = FEATURED_COUNTRY_CODES.indexOf(b.code);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name, 'tr');
    });
  }, [countries, oppSearch]);

  const filteredTableCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [countries, countrySearch]);

  const selectHomeCountry = async (c: Country) => {
    setManualBlueSoldiersDraft(c.soldierCount);
    setHomeRemainingDraft(c.soldierCount);
    await saveActiveBattle({
      ...battle,
      homeCountryCode: c.code,
      homeCountryName: c.name,
      homeFlag: c.flag,
      homeColor: c.color,
      homeModel: c.modelType,
      homeSoldiers: c.soldierCount,
      homeRemaining: c.soldierCount,
    });
    notify(`Mavi takım (Sağ) ${c.name} (${c.soldierCount.toLocaleString('tr-TR')} asker) seçildi.`);
  };

  const selectOpponentCountry = async (c: Country) => {
    const redCount = manualBlueEnabled ? opponentSoldiersDraft : computedAutoRedSoldiers;
    await saveActiveBattle({
      ...battle,
      opponentCountryCode: c.code,
      opponentCountryName: c.name,
      opponentFlag: c.flag,
      opponentColor: c.color,
      opponentModel: c.modelType,
      opponentSoldiers: redCount,
      opponentRemaining: redCount,
    });
    notify(`Kırmızı takım (Sol) ${c.name} olarak seçildi.`);
  };

  const handleApplyBattleSettings = async () => {
    const finalRed = manualBlueEnabled
      ? opponentSoldiersDraft
      : instagram.lastValidFollowers * soldiersPerFollowerDraft;
    const finalBlue = manualBlueSoldiersDraft;
    await saveSiteSettings({
      ...settings,
      soldiersPerFollower: soldiersPerFollowerDraft,
      arenaTheme: arenaThemeDraft,
      wallLoweringDuration: wallDurationDraft,
      battleSpeed: battleSpeedDraft,
      defaultCamera: defaultCamDraft,
    });
    await saveActiveBattle({
      ...battle,
      homeColor: homeColorDraft,
      homeModel: homeModelDraft,
      homeSoldiers: finalBlue,
      homeRemaining: battle.status === 'idle' ? finalBlue : Math.min(finalBlue, homeRemainingDraft),
      opponentColor: opponentColorDraft,
      opponentModel: opponentModelDraft,
      opponentSoldiers: finalRed,
      opponentRemaining: battle.status === 'idle' ? finalRed : Math.min(finalRed, opponentRemainingDraft),
      scheduledStartAt: scheduledDraft,
      arenaTheme: arenaThemeDraft,
      battleSpeed: battleSpeedDraft,
      soldierScale: soldierScaleDraft,
      manualOverrideBlue: manualBlueEnabled,
    });
    notify('Savaş, asker durumu ve 3B ayarları kaydedildi.');
  };

  const handleStartBattle = async () => {
    const redCount = manualBlueEnabled
      ? opponentSoldiersDraft
      : instagram.lastValidFollowers * soldiersPerFollowerDraft;
    const blueCount = manualBlueSoldiersDraft;
    await saveActiveBattle({
      ...battle,
      homeSoldiers: blueCount,
      homeRemaining: blueCount,
      opponentSoldiers: redCount,
      opponentRemaining: redCount,
      status: 'wall_lowering',
      wallHeight: 14,
      winnerSide: 'none',
      winnerName: '',
    });
    notify('Merkez duvar iniyor, savaş başlatılıyor...');
    window.setTimeout(async () => {
      await saveActiveBattle({
        ...battleRef.current,
        status: 'fighting',
        wallHeight: 0,
      });
    }, Math.max(1500, wallDurationDraft * 1000));
  };

  const handleStopOrResetBattle = async (resetToIdle: boolean) => {
    const redCount = manualBlueEnabled
      ? opponentSoldiersDraft
      : instagram.lastValidFollowers * soldiersPerFollowerDraft;
    const blueCount = manualBlueSoldiersDraft;
    await saveActiveBattle({
      ...battle,
      homeSoldiers: blueCount,
      homeRemaining: resetToIdle ? blueCount : battle.homeRemaining,
      opponentSoldiers: redCount,
      opponentRemaining: resetToIdle ? redCount : battle.opponentRemaining,
      status: 'idle',
      wallHeight: 14,
      winnerSide: 'none',
      winnerName: '',
    });
    notify(resetToIdle ? 'Savaş sıfırlandı ve merkez duvar yükseltildi.' : 'Savaş durduruldu.');
  };

  const handleLoadTurkeyVsGermanyPreset = async () => {
    await saveInstagramSync({
      ...DEFAULT_INSTAGRAM,
      followers: 620,
      lastValidFollowers: 620,
      syncStatus: 'ok',
      source: 'admin_manual',
      lastUpdatedAt: new Date().toISOString(),
    });
    await saveActiveBattle({
      ...DEFAULT_BATTLE,
      updatedAt: new Date().toISOString(),
    });
    notify('Varsayılan eşleşme yüklendi: Türkiye (620) vs Almanya (3.000).');
  };

  const handleSyncInstagramNow = async () => {
    if (!sessionToken) return;
    setSyncLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      };
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken().catch(() => '');
        if (idToken) headers['X-Firebase-Id-Token'] = idToken;
      }
      const res = await fetch('/api/instagram/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          handle: settings.instagramHandle,
          lastValidFollowers: instagram.lastValidFollowers,
        }),
      });
      const data = (await res.json()) as InstagramSync & { error?: string };
      if (!res.ok) {
        notify(data.error || 'Instagram senkronizasyon hatası.');
        return;
      }
      await saveInstagramSync(data);

      // Auto-update Red/Türkiye team soldier count unless manual override is active
      if (!battle.manualOverrideBlue) {
        const autoSoldiers = data.lastValidFollowers * settings.soldiersPerFollower;
        await saveActiveBattle({
          ...battle,
          opponentSoldiers: autoSoldiers,
          opponentRemaining: battle.status === 'idle' ? autoSoldiers : battle.opponentRemaining,
        });
      }

      notify(
        data.syncStatus === 'ok'
          ? `@${data.handle} güncellendi: ${data.followers.toLocaleString('tr-TR')} takipçi.`
          : `Instagram API erişilemedi, son geçerli sayı korundu (${data.lastValidFollowers.toLocaleString('tr-TR')}).`
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Instagram senkronizasyonu başarısız.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSaveManualFollowers = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sessionToken) return;
    const cleanCount = Math.max(0, Math.round(Number(manualFollowersDraft) || 0));
    setSyncLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      };
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken().catch(() => '');
        if (idToken) headers['X-Firebase-Id-Token'] = idToken;
      }
      const res = await fetch('/api/instagram/manual', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          followers: cleanCount,
          handle: settings.instagramHandle,
        }),
      });
      const data = (await res.json()) as InstagramSync & { error?: string };
      if (!res.ok) {
        notify(data.error || 'Takipçi sayısı güncellenemedi.');
        return;
      }
      await saveInstagramSync(data);
      if (!battle.manualOverrideBlue) {
        const autoSoldiers = cleanCount * soldiersPerFollowerDraft;
        await saveActiveBattle({
          ...battle,
          opponentSoldiers: autoSoldiers,
          opponentRemaining: battle.status === 'idle' ? autoSoldiers : battle.opponentRemaining,
        });
      }
      notify(`Takipçi sayısı ${cleanCount.toLocaleString('tr-TR')} olarak güncellendi.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Takipçi güncelleme hatası.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSaveEditedCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCountry) return;
    await saveCountry(editingCountry);
    // Sync active battle if editing currently selected home or opponent country
    if (battle.homeCountryCode === editingCountry.code) {
      await saveActiveBattle({
        ...battle,
        homeCountryName: editingCountry.name,
        homeFlag: editingCountry.flag,
        homeColor: editingCountry.color,
        homeModel: editingCountry.modelType,
      });
    }
    if (battle.opponentCountryCode === editingCountry.code) {
      await saveActiveBattle({
        ...battle,
        opponentCountryName: editingCountry.name,
        opponentFlag: editingCountry.flag,
        opponentColor: editingCountry.color,
        opponentModel: editingCountry.modelType,
        opponentSoldiers: editingCountry.soldierCount,
        opponentRemaining: battle.status === 'idle' ? editingCountry.soldierCount : battle.opponentRemaining,
      });
    }
    setEditingCountry(null);
    notify(`${editingCountry.name} güncellendi.`);
  };

  const handleCreateCustomCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountryForm.code.trim() || !newCountryForm.name.trim()) return;
    await saveCountry({
      code: newCountryForm.code.trim().toUpperCase().slice(0, 10),
      name: newCountryForm.name.trim(),
      flag: newCountryForm.flag.trim() || '🏳️',
      soldierCount: Number(newCountryForm.soldierCount) || 1000,
      color: newCountryForm.color,
      modelType: newCountryForm.modelType,
      isCustom: true,
      updatedAt: new Date().toISOString(),
    });
    setNewCountryForm({
      code: '',
      name: '',
      flag: '🏳️',
      soldierCount: 1500,
      color: '#DC2626',
      modelType: 'infantry',
    });
    notify('Yeni ülke Firestore koleksiyonuna eklendi.');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    if (newPwd !== newPwdConfirm) {
      notify('Yeni şifreler eşleşmiyor.');
      return;
    }
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      };
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken().catch(() => '');
        if (idToken) headers['X-Firebase-Id-Token'] = idToken;
      }
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        notify(data.error || 'Şifre güncellenemedi.');
        return;
      }
      setCurrentPwd('');
      setNewPwd('');
      setNewPwdConfirm('');
      notify(data.message || 'Şifre başarıyla güncellendi.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Şifre değiştirme hatası.');
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminUid.trim() || !newAdminEmail.trim()) return;
    const now = new Date().toISOString();
    await saveAdminRecord({
      uid: newAdminUid.trim(),
      email: newAdminEmail.trim(),
      displayName: newAdminName.trim() || 'Yönetici',
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    });
    setNewAdminUid('');
    setNewAdminEmail('');
    setNewAdminName('');
    notify('Yeni yönetici kaydı eklendi.');
  };

  // Country comparison summary aggregated from battle_history
  const comparisonStats = useMemo(() => {
    const map = new Map<string, { matchup: string; total: number; homeWins: number; oppWins: number }>();
    for (const h of history) {
      const key = `${h.opponentCountryName} vs ${h.homeCountryName}`;
      const curr = map.get(key) || { matchup: key, total: 0, homeWins: 0, oppWins: 0 };
      curr.total += 1;
      if (h.winnerSide === 'home') curr.homeWins += 1;
      if (h.winnerSide === 'opponent') curr.oppWins += 1;
      map.set(key, curr);
    }
    return Array.from(map.values());
  }, [history]);

  // GATE: Password-Only Protected Login Screen
  if (!sessionToken) {
    return (
      <div className="min-h-[100dvh] bg-[#070B12] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-[#0D1422] border border-slate-800 p-5 sm:p-7 shadow-2xl space-y-5">
          <div className="space-y-1.5 text-center">
            <div className="mx-auto w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-sky-400" />
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white">Yönetici Paneli</h1>
            <p className="text-xs text-slate-400">
              Giriş yapmak için yönetici şifresini girin.
            </p>
          </div>

          <form onSubmit={handleAdminAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {needsInitialSetup
                  ? 'İlk Kurulum Yönetici Şifresini Belirleyin'
                  : 'Yönetici Şifresi'}
              </label>
              <input
                type="password"
                required
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Şifreyi girin"
                className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
              {needsInitialSetup && !configuredViaEnv && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  İlk çalıştırma kurulumu: Belirlediğiniz şifre sunucuda şifrelenerek saklanacaktır.
                </p>
              )}
            </div>

            {needsInitialSetup && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Şifre Tekrar
                </label>
                <input
                  type="password"
                  required
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Şifreyi tekrar girin"
                  className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            )}

            {authError && (
              <div className="rounded-lg bg-rose-950/50 border border-rose-500/40 p-3 text-xs text-rose-300">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors"
            >
              {authLoading
                ? 'Doğrulanıyor...'
                : needsInitialSetup
                ? 'Şifreyi Oluştur ve Panele Gir'
                : 'Giriş Yap'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'control', label: 'Savaş Kontrolü', icon: <Activity className="w-4 h-4" /> },
    { id: 'countries', label: 'Ülkeler', icon: <Globe className="w-4 h-4" /> },
    { id: 'instagram', label: 'Instagram', icon: <Instagram className="w-4 h-4" /> },
    { id: 'history', label: 'Geçmiş', icon: <History className="w-4 h-4" /> },
    { id: 'reels', label: 'Reels', icon: <Film className="w-4 h-4" /> },
    { id: 'security', label: 'Güvenlik', icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  const showRedSection = mobileControlSection === 'all' || mobileControlSection === 'red';
  const showBlueSection = mobileControlSection === 'all' || mobileControlSection === 'blue';
  const showSettingsSection = mobileControlSection === 'all' || mobileControlSection === 'settings';

  return (
    <div className="min-h-[100dvh] bg-[#070B12] text-slate-100 overflow-x-hidden">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-30 bg-[#0B111C]/95 border-b border-slate-800 px-3 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sliders className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <h1 className="font-display text-sm sm:text-lg font-bold text-white truncate">
              Yönetim Merkezi
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`hidden xs:inline-flex sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                firebaseUser
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <span>{firebaseUser ? 'Bulut Bağlı' : 'Bulut Opsiyonel'}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-xs font-medium text-rose-200 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Çıkış</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sticky Navigation Tabs */}
      <div className="sticky top-[45px] sm:top-[53px] z-20 border-b border-slate-800 bg-[#0A0F1A]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center gap-1 overflow-x-auto py-1.5 no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3">
          <div className="rounded-lg bg-sky-950/60 border border-sky-500/40 px-3.5 py-2 text-xs text-sky-200">
            {toast}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* TAB 1: BATTLE CONTROL */}
        {activeTab === 'control' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Compact Mobile-First Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3 sm:p-4">
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">Kırmızı (Sol)</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <CountryFlag code={battle.opponentCountryCode} flag={battle.opponentFlag} color={battle.opponentColor} name={battle.opponentCountryName} className="w-6 h-3.5 sm:w-7 sm:h-4 shrink-0" />
                  <p className="font-display text-sm sm:text-lg font-bold text-rose-400 truncate">
                    {battle.opponentCountryName}
                  </p>
                </div>
                <p className="mt-1 font-mono text-xs sm:text-sm text-white tabular-nums truncate">
                  {battle.opponentRemaining.toLocaleString('tr-TR')} / {battle.opponentSoldiers.toLocaleString('tr-TR')}
                </p>
              </div>

              <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3 sm:p-4">
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">Mavi (Sağ)</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <CountryFlag code={battle.homeCountryCode} flag={battle.homeFlag} color={battle.homeColor} name={battle.homeCountryName} className="w-6 h-3.5 sm:w-7 sm:h-4 shrink-0" />
                  <p className="font-display text-sm sm:text-lg font-bold text-sky-400 truncate">
                    {battle.homeCountryName}
                  </p>
                </div>
                <p className="mt-1 font-mono text-xs sm:text-sm text-white tabular-nums truncate">
                  {battle.homeRemaining.toLocaleString('tr-TR')} / {battle.homeSoldiers.toLocaleString('tr-TR')}
                </p>
              </div>

              <div className="col-span-2 lg:col-span-1 rounded-xl bg-[#0D1422] border border-slate-800 p-3 sm:p-4 space-y-1.5">
                <p className="text-[11px] sm:text-xs text-slate-400">Takipçi Sayısı (@{instagram.handle})</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1000000000}
                    value={manualFollowersDraft}
                    onChange={(e) => setManualFollowersDraft(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-1.5 font-mono text-sm text-white tabular-nums"
                  />
                  <button
                    type="button"
                    disabled={syncLoading}
                    onClick={() => void handleSaveManualFollowers()}
                    className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                  >
                    Kaydet
                  </button>
                </div>
              </div>

              <div className="col-span-2 lg:col-span-1 rounded-xl bg-[#0D1422] border border-slate-800 p-3 sm:p-4 flex flex-col justify-between">
                <p className="text-[11px] sm:text-xs text-slate-400">Savaş Kontrolü</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 sm:gap-2">
                  {battle.status === 'idle' || battle.status === 'finished' || battle.status === 'countdown' ? (
                    <button
                      type="button"
                      onClick={handleStartBattle}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Başlat</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStopOrResetBattle(false)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Durdur</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleStopOrResetBattle(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Sıfırla</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLoadTurkeyVsGermanyPreset()}
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-sky-900/40 hover:bg-sky-900/60 border border-sky-500/30 text-xs font-medium text-sky-200 transition-colors whitespace-nowrap"
                  >
                    <span>TR 620 / DE 3000</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Section Switcher so nothing gets pushed down far on small screens */}
            <div className="lg:hidden grid grid-cols-4 gap-1 rounded-xl bg-[#0D1422] border border-slate-800 p-1">
              {(
                [
                  { id: 'all', label: 'Tümü' },
                  { id: 'red', label: 'Kırmızı' },
                  { id: 'blue', label: 'Mavi' },
                  { id: 'settings', label: '3B & Saat' },
                ] as { id: MobileControlSection; label: string }[]
              ).map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setMobileControlSection(sec.id)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                    mobileControlSection === sec.id
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>

            {/* Country Selection Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Left / Red Team Selector (Our Country / Türkiye - Follower Linked) */}
              {showRedSection && (
              <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm sm:text-base font-bold text-rose-400">
                    Kırmızı Takım (Sol)
                  </h2>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 truncate">
                    <CountryFlag code={battle.opponentCountryCode} flag={battle.opponentFlag} color={battle.opponentColor} className="w-6 h-4 shrink-0" />
                    <span className="truncate">{battle.opponentCountryName}</span>
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={oppSearch}
                    onChange={(e) => setOppSearch(e.target.value)}
                    placeholder="Ülke ara (Türkiye, Azerbaycan...)"
                    className="w-full rounded-lg bg-[#090E18] border border-slate-700 pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="max-h-32 sm:max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 pr-1">
                  {filteredOppCountries.map((c) => (
                    <button
                      key={`opp-${c.code}`}
                      type="button"
                      onClick={() => void selectOpponentCountry(c)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg border text-left text-xs transition-colors ${
                        battle.opponentCountryCode === c.code
                          ? 'bg-rose-600/20 border-rose-500 text-white'
                          : 'bg-[#090E18] border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <CountryFlag code={c.code} flag={c.flag} color={c.color} className="w-5 h-3.5 sm:w-6 sm:h-4 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">
                      Takipçi Başına Asker
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={soldiersPerFollowerDraft}
                      onChange={(e) => setSoldiersPerFollowerDraft(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm font-mono text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">
                      Asker Gücü Modu
                    </label>
                    <button
                      type="button"
                      onClick={() => setManualBlueEnabled((v) => !v)}
                      className={`w-full rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors truncate ${
                        manualBlueEnabled
                          ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                          : 'bg-rose-600/20 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      {manualBlueEnabled
                        ? 'Manuel Mod'
                        : `Otomatik (${computedAutoRedSoldiers.toLocaleString('tr-TR')})`}
                    </button>
                  </div>

                  {manualBlueEnabled && (
                    <div className="col-span-2">
                      <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Manuel Toplam Asker</label>
                      <input
                        type="number"
                        min={0}
                        max={100000000}
                        value={opponentSoldiersDraft}
                        onChange={(e) => setOpponentSoldiersDraft(Math.max(0, Number(e.target.value)))}
                        className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm font-mono text-white tabular-nums"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Kalan Asker</label>
                    <input
                      type="number"
                      min={0}
                      max={100000000}
                      value={opponentRemainingDraft}
                      onChange={(e) => setOpponentRemainingDraft(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm font-mono text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">3B Model</label>
                    <select
                      value={opponentModelDraft}
                      onChange={(e) => setOpponentModelDraft(e.target.value as SoldierModelType)}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2 py-2 text-sm sm:text-xs text-white"
                    >
                      {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Takım Rengi</label>
                    <input
                      type="color"
                      value={opponentColorDraft}
                      onChange={(e) => setOpponentColorDraft(e.target.value)}
                      className="h-9 w-full rounded bg-[#090E18] border border-slate-700 cursor-pointer p-1"
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Right / Blue Team Selector (Opposing Country / Almanya) */}
              {showBlueSection && (
              <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm sm:text-base font-bold text-sky-400">
                    Mavi Takım (Sağ)
                  </h2>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 truncate">
                    <CountryFlag code={battle.homeCountryCode} flag={battle.homeFlag} color={battle.homeColor} className="w-6 h-4 shrink-0" />
                    <span className="truncate">{battle.homeCountryName}</span>
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={homeSearch}
                    onChange={(e) => setHomeSearch(e.target.value)}
                    placeholder="Ülke ara (Almanya, ABD, Rusya...)"
                    className="w-full rounded-lg bg-[#090E18] border border-slate-700 pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="max-h-32 sm:max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 pr-1">
                  {filteredHomeCountries.map((c) => (
                    <button
                      key={`home-${c.code}`}
                      type="button"
                      onClick={() => void selectHomeCountry(c)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg border text-left text-xs transition-colors ${
                        battle.homeCountryCode === c.code
                          ? 'bg-sky-600/20 border-sky-500 text-white'
                          : 'bg-[#090E18] border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <CountryFlag code={c.code} flag={c.flag} color={c.color} className="w-5 h-3.5 sm:w-6 sm:h-4 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Toplam Asker</label>
                    <input
                      type="number"
                      min={0}
                      max={100000000}
                      value={manualBlueSoldiersDraft}
                      onChange={(e) => setManualBlueSoldiersDraft(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm font-mono text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Kalan Asker</label>
                    <input
                      type="number"
                      min={0}
                      max={100000000}
                      value={homeRemainingDraft}
                      onChange={(e) => setHomeRemainingDraft(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm font-mono text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">3B Model</label>
                    <select
                      value={homeModelDraft}
                      onChange={(e) => setHomeModelDraft(e.target.value as SoldierModelType)}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2 py-2 text-sm sm:text-xs text-white"
                    >
                      {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Takım Rengi</label>
                    <input
                      type="color"
                      value={homeColorDraft}
                      onChange={(e) => setHomeColorDraft(e.target.value)}
                      className="h-9 w-full rounded bg-[#090E18] border border-slate-700 cursor-pointer p-1"
                    />
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* Schedule & 3D System Parameters */}
            {showSettingsSection && (
            <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <h2 className="font-display text-sm sm:text-base font-bold text-white">
                  Başlangıç Saati & 3B Ayarları
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Başlangıç Saati</label>
                  <input
                    type="datetime-local"
                    value={scheduledDraft ? scheduledDraft.slice(0, 16) : ''}
                    onChange={(e) =>
                      setScheduledDraft(e.target.value ? new Date(e.target.value).toISOString() : '')
                    }
                    className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Arena Teması</label>
                  <select
                    value={arenaThemeDraft}
                    onChange={(e) => setArenaThemeDraft(e.target.value as ArenaTheme)}
                    className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2 py-2 text-sm sm:text-xs text-white"
                  >
                    <option value="twilight">Alacakaranlık</option>
                    <option value="desert">Çöl Cephesi</option>
                    <option value="alpine">Buzul Geçidi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Varsayılan Kamera</label>
                  <select
                    value={defaultCamDraft}
                    onChange={(e) => setDefaultCamDraft(e.target.value as CameraPreset)}
                    className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2 py-2 text-sm sm:text-xs text-white"
                  >
                    <option value="overview">Genel Bakış</option>
                    <option value="red">Kırmızı Cephe</option>
                    <option value="blue">Mavi Cephe</option>
                    <option value="cinematic">Sinematik</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Savaş Hızı ({battleSpeedDraft}x)</label>
                  <input
                    type="range"
                    min={0.5}
                    max={4}
                    step={0.25}
                    value={battleSpeedDraft}
                    onChange={(e) => setBattleSpeedDraft(Number(e.target.value))}
                    className="w-full mt-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] sm:text-xs text-slate-400 mb-1">Asker Ölçeği ({soldierScaleDraft}x)</label>
                  <input
                    type="range"
                    min={0.7}
                    max={1.5}
                    step={0.1}
                    value={soldierScaleDraft}
                    onChange={(e) => setSoldierScaleDraft(Number(e.target.value))}
                    className="w-full mt-2"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleApplyBattleSettings}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors"
                >
                  Tüm Savaş ve 3B Ayarlarını Kaydet
                </button>
              </div>
            </div>
            )}
          </div>
        )}

        {/* TAB 2: COUNTRIES MANAGEMENT */}
        {activeTab === 'countries' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Add Custom Country */}
            <form
              onSubmit={handleCreateCustomCountry}
              className="rounded-xl bg-[#0D1422] border border-slate-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" />
                <h2 className="font-display text-sm sm:text-base font-bold text-white">Yeni Ülke Ekle</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                <input
                  type="text"
                  required
                  placeholder="Kod (TR2)"
                  value={newCountryForm.code}
                  onChange={(e) => setNewCountryForm({ ...newCountryForm, code: e.target.value })}
                  className="rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Ülke Adı"
                  value={newCountryForm.name}
                  onChange={(e) => setNewCountryForm({ ...newCountryForm, name: e.target.value })}
                  className="rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Bayrak (🇹🇷)"
                  value={newCountryForm.flag}
                  onChange={(e) => setNewCountryForm({ ...newCountryForm, flag: e.target.value })}
                  className="rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                />
                <input
                  type="number"
                  min={0}
                  value={newCountryForm.soldierCount}
                  onChange={(e) =>
                    setNewCountryForm({ ...newCountryForm, soldierCount: Number(e.target.value) })
                  }
                  className="rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs font-mono text-white"
                />
                <select
                  value={newCountryForm.modelType}
                  onChange={(e) =>
                    setNewCountryForm({ ...newCountryForm, modelType: e.target.value as SoldierModelType })
                  }
                  className="rounded-lg bg-[#090E18] border border-slate-700 px-2 py-2 text-sm sm:text-xs text-white"
                >
                  {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newCountryForm.color}
                    onChange={(e) => setNewCountryForm({ ...newCountryForm, color: e.target.value })}
                    className="h-9 w-11 rounded bg-transparent border border-slate-700 cursor-pointer shrink-0"
                  />
                  <button
                    type="submit"
                    className="flex-1 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white"
                  >
                    Ekle
                  </button>
                </div>
              </div>
            </form>

            {/* Edit Modal Inline */}
            {editingCountry && (
              <form
                onSubmit={handleSaveEditedCountry}
                className="rounded-xl bg-[#101A2C] border border-sky-500/40 p-3.5 sm:p-5 space-y-3 sm:space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm sm:text-base font-bold text-white truncate">
                    Düzenleniyor: {editingCountry.flag} {editingCountry.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingCountry(null)}
                    className="text-xs text-slate-400 hover:text-white shrink-0"
                  >
                    İptal
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Ülke Adı</label>
                    <input
                      type="text"
                      value={editingCountry.name}
                      onChange={(e) => setEditingCountry({ ...editingCountry, name: e.target.value })}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Bayrak</label>
                    <input
                      type="text"
                      value={editingCountry.flag}
                      onChange={(e) => setEditingCountry({ ...editingCountry, flag: e.target.value })}
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Sabit Asker</label>
                    <input
                      type="number"
                      min={0}
                      value={editingCountry.soldierCount}
                      onChange={(e) =>
                        setEditingCountry({ ...editingCountry, soldierCount: Number(e.target.value) })
                      }
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">3B Model</label>
                    <select
                      value={editingCountry.modelType}
                      onChange={(e) =>
                        setEditingCountry({
                          ...editingCountry,
                          modelType: e.target.value as SoldierModelType,
                        })
                      }
                      className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-2 py-2 text-sm sm:text-xs text-white"
                    >
                      {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] text-slate-400 mb-1">Renk</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingCountry.color}
                        onChange={(e) => setEditingCountry({ ...editingCountry, color: e.target.value })}
                        className="h-9 w-11 rounded bg-transparent border border-slate-700 cursor-pointer shrink-0"
                      />
                      <button
                        type="submit"
                        className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* World Countries Table */}
            <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-sky-400" />
                  <h2 className="font-display text-sm sm:text-base font-bold text-white">
                    Tüm Dünya Ülkeleri ({filteredTableCountries.length})
                  </h2>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    placeholder="Ülke adı veya kodu ara..."
                    className="w-full rounded-lg bg-[#090E18] border border-slate-700 pl-9 pr-3 py-2 text-sm sm:text-xs text-white"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-[340px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#0D1422] border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Ülke</th>
                      <th className="py-2.5 px-3">Kod</th>
                      <th className="py-2.5 px-3">Renk</th>
                      <th className="py-2.5 px-3">3B Model</th>
                      <th className="py-2.5 px-3 text-right">Asker Sayısı</th>
                      <th className="py-2.5 px-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredTableCountries.map((c) => (
                      <tr key={c.code} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-medium text-white">
                          <span className="mr-2 text-base">{c.flag}</span>
                          {c.name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{c.code}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1.5 font-mono text-slate-300">
                            <span
                              className="w-3 h-3 rounded-sm inline-block border border-white/20"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.color}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{MODEL_TYPE_LABELS[c.modelType]}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200 tabular-nums">
                          {c.soldierCount.toLocaleString('tr-TR')}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setEditingCountry(c)}
                            className="text-sky-400 hover:text-sky-300 underline"
                          >
                            Düzenle
                          </button>
                          {c.isCustom && (
                            <button
                              type="button"
                              onClick={() => void removeCountry(c.code)}
                              className="text-rose-400 hover:text-rose-300"
                              title="Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INSTAGRAM SYNC */}
        {activeTab === 'instagram' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Instagram className="w-5 h-5 text-pink-400 shrink-0" />
                  <h2 className="font-display text-base sm:text-lg font-bold text-white">
                    @{instagram.handle} Takipçi
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={syncLoading}
                  onClick={handleSyncInstagramNow}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                  <span>{syncLoading ? 'Sorgulanıyor...' : 'Şimdi Güncelle'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 pt-1">
                <div className="rounded-lg bg-[#090E18] border border-slate-800 p-3 sm:p-4">
                  <p className="text-[11px] sm:text-xs text-slate-400">Aktif Takipçi</p>
                  <p className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums">
                    {instagram.followers.toLocaleString('tr-TR')}
                  </p>
                </div>
                <div className="rounded-lg bg-[#090E18] border border-slate-800 p-3 sm:p-4">
                  <p className="text-[11px] sm:text-xs text-slate-400 truncate">Asker Gücü ({battle.opponentCountryName})</p>
                  <p className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-rose-400 tabular-nums">
                    {(instagram.lastValidFollowers * settings.soldiersPerFollower).toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveManualFollowers} className="pt-2 border-t border-slate-800 space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Takipçi Sayısını Manuel Değiştir (Admin)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1000000000}
                    value={manualFollowersDraft}
                    onChange={(e) => setManualFollowersDraft(Math.max(0, Number(e.target.value)))}
                    className="flex-1 rounded-lg bg-[#090E18] border border-slate-700 px-3 py-2 text-sm font-mono text-white tabular-nums"
                  />
                  <button
                    type="submit"
                    disabled={syncLoading}
                    className="px-3.5 sm:px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    Güncelle
                  </button>
                </div>
              </form>

              <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <p>
                  Senkronizasyon Durumu:{' '}
                  <span className="text-slate-200 font-medium">
                    {instagram.syncStatus === 'ok'
                      ? 'Canlı / Manuel Güncel'
                      : instagram.syncStatus === 'preserved_fallback'
                      ? 'API Erişilemedi · Son Geçerli Sayı Korundu'
                      : 'İlk Senkronizasyon Bekleniyor'}
                  </span>
                </p>
                <p>Son Geçerli Takipçi: {instagram.lastValidFollowers.toLocaleString('tr-TR')}</p>
                <p>Son Güncelleme: {new Date(instagram.lastUpdatedAt).toLocaleString('tr-TR')}</p>
                {instagram.lastError && <p className="text-amber-300">Not: {instagram.lastError}</p>}
              </div>
            </div>

            <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-6 space-y-3">
              <h3 className="font-display text-base font-bold text-white">
                Otomatik Asker Gücü Kuralları
              </h3>
              <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4">
                <li>
                  Takipçi sayısı arttığında veya azaldığında bizim ülkemizin ({battle.opponentCountryName}) asker sayısı çarpana göre otomatik güncellenir.
                </li>
                <li>
                  Instagram API veya profil yanıtına geçici olarak ulaşılamazsa sistem asla sıfırlama yapmaz ve son geçerli sayıyı korur.
                </li>
                <li>
                  Varsayılan kural: 1 takipçi = {settings.soldiersPerFollower} asker. Çarpanı "Savaş Kontrolü" sekmesinden değiştirebilirsiniz.
                </li>
                <li>
                  Karşı ülkenin ({battle.homeCountryName}) asker sayısı yalnızca yönetici tarafından değiştirilir ve savaş harici sabit kalır.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 4: BATTLE HISTORY & COUNTRY COMPARISON */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-5 space-y-4">
              <h2 className="font-display text-base font-bold text-white">
                Ülke Karşılaştırma Geçmişi
              </h2>
              {comparisonStats.length === 0 ? (
                <p className="text-xs text-slate-400">Henüz tamamlanmış ülke karşılaştırması bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {comparisonStats.map((st) => (
                    <div key={st.matchup} className="rounded-lg bg-[#090E18] border border-slate-800 p-3.5 text-xs space-y-1">
                      <p className="font-semibold text-white">{st.matchup}</p>
                      <p className="text-slate-400 tabular-nums">
                        Toplam Savaş: {st.total} · Rakip Galibiyet: {st.oppWins} · Bizim Galibiyet: {st.homeWins}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-5 space-y-4">
              <h2 className="font-display text-base font-bold text-white">Önceki Savaşlar</h2>
              {history.length === 0 ? (
                <p className="text-xs text-slate-400">Henüz kaydedilmiş savaş geçmişi yok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">Tarih</th>
                        <th className="py-2.5 px-3">Kırmızı (Rakip)</th>
                        <th className="py-2.5 px-3">Mavi (Benim Ülkem)</th>
                        <th className="py-2.5 px-3">Kazanan</th>
                        <th className="py-2.5 px-3 text-right">Süre</th>
                        <th className="py-2.5 px-3 text-right">Reels</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-400 tabular-nums">
                            {new Date(h.createdAt).toLocaleString('tr-TR')}
                          </td>
                          <td className="py-2.5 px-3 text-rose-300 tabular-nums">
                            {h.opponentFlag} {h.opponentCountryName} ({h.opponentSoldiersStart.toLocaleString('tr-TR')} → {h.opponentSoldiersEnd.toLocaleString('tr-TR')})
                          </td>
                          <td className="py-2.5 px-3 text-sky-300 tabular-nums">
                            {h.homeFlag} {h.homeCountryName} ({h.homeSoldiersStart.toLocaleString('tr-TR')} → {h.homeSoldiersEnd.toLocaleString('tr-TR')})
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-white">{h.winnerName}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums">
                            {h.durationSeconds} sn
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {h.reelsUrl ? (
                              <a
                                href={h.reelsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 hover:underline"
                              >
                                İzle
                              </a>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: REELS STUDIO */}
        {activeTab === 'reels' && (
          <ReelsStudio battle={battle} history={history} onNotify={notify} />
        )}

        {/* TAB 6: SECURITY & ADMINS */}
        {activeTab === 'security' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Password Change */}
            <form
              onSubmit={handleChangePassword}
              className="rounded-xl bg-[#0D1422] border border-slate-800 p-4 sm:p-6 space-y-3 sm:space-y-4"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-sky-400" />
                <h2 className="font-display text-sm sm:text-base font-bold text-white">Yönetici Şifresini Değiştir</h2>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Mevcut Şifre</label>
                <input
                  type="password"
                  required
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-3 py-2 text-sm sm:text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Yeni Şifre (En az 6 karakter)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-3 py-2 text-sm sm:text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Yeni Şifre Tekrar</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPwdConfirm}
                  onChange={(e) => setNewPwdConfirm(e.target.value)}
                  className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-3 py-2 text-sm sm:text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors"
              >
                Şifreyi Güncelle
              </button>
            </form>

            {/* Optional Cloud Firestore & Storage Link + Admin Accounts */}
            <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-4 sm:p-6 space-y-4">
              <div className="rounded-lg bg-[#090E18] border border-slate-800 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">
                    Firebase Bulut Senkronizasyonu (Opsiyonel)
                  </span>
                  <span className={`text-[11px] font-medium ${firebaseUser ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {firebaseUser ? 'Bağlı' : 'Bağlı Değil'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Yönetici paneli tek başına şifre ile çalışır. Çoklu cihaz Firestore eşitlemesi ve Reels Firebase Storage yüklemesi için Google hesabınızı isteğe bağlı bağlayabilirsiniz.
                </p>
                {firebaseUser ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-300 pt-1">
                    <span className="truncate">{firebaseUser.email}</span>
                    <button
                      type="button"
                      onClick={() => void signOut(auth)}
                      className="text-rose-300 hover:text-rose-200 underline shrink-0"
                    >
                      Bağlantıyı Kes
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleFirebaseSignIn}
                    className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white transition-colors"
                  >
                    Google Hesabı ile Bulutu Bağla
                  </button>
                )}
              </div>

              {firebaseUser && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-sky-400" />
                    <h2 className="font-display text-sm sm:text-base font-bold text-white">
                      Yetkili Yönetici Hesapları (Firestore)
                    </h2>
                  </div>

                  <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Firebase UID"
                      value={newAdminUid}
                      onChange={(e) => setNewAdminUid(e.target.value)}
                      className="rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                    />
                    <input
                      type="email"
                      required
                      placeholder="E-posta"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ad"
                        value={newAdminName}
                        onChange={(e) => setNewAdminName(e.target.value)}
                        className="flex-1 rounded-lg bg-[#090E18] border border-slate-700 px-2.5 py-2 text-sm sm:text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                      >
                        Ekle
                      </button>
                    </div>
                  </form>

                  <div className="divide-y divide-slate-800 text-xs">
                    {admins.map((a) => (
                      <div key={a.uid} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{a.email}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {a.displayName} · {a.role}
                          </p>
                        </div>
                        {a.uid !== firebaseUser.uid && (
                          <button
                            type="button"
                            onClick={() => void deleteAdminRecord(a.uid)}
                            className="text-rose-400 hover:text-rose-300 shrink-0"
                            title="Yetkiyi Kaldır"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
