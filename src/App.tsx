import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { AdminPanel } from './components/AdminPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpectatorArena } from './components/SpectatorArena';
import { WORLD_COUNTRIES } from './data/countries';
import {
  DEFAULT_BATTLE,
  DEFAULT_INSTAGRAM,
  DEFAULT_SETTINGS,
  fetchServerBattleState,
  subscribeLocalSyncSignal,
  subscribePublicBattleState,
} from './services/battleStore';
import { auth } from './services/firebase';
import {
  ActiveBattle,
  BattleHistoryEntry,
  Country,
  InstagramSync,
  SiteSettings,
} from './types/battle';

function isAdminRouteHash(hash: string): boolean {
  const normalized = hash.trim().toLowerCase();
  return normalized === '#/yoneticipaneli' || normalized.startsWith('#/yoneticipaneli/');
}

function isNewer(incomingTs?: string, currentTs?: string): boolean {
  const inMs = incomingTs ? Date.parse(incomingTs) : 0;
  const curMs = currentTs ? Date.parse(currentTs) : 0;
  if (!Number.isFinite(inMs)) return false;
  if (!Number.isFinite(curMs)) return true;
  return inMs >= curMs;
}

export default function App() {
  const [hash, setHash] = useState<string>(() => window.location.hash);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [battle, setBattle] = useState<ActiveBattle>(DEFAULT_BATTLE);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [instagram, setInstagram] = useState<InstagramSync>(DEFAULT_INSTAGRAM);
  const [countries, setCountries] = useState<Country[]>(WORLD_COUNTRIES);
  const [history, setHistory] = useState<BattleHistoryEntry[]>([]);

  const battleTsRef = useRef<string>(DEFAULT_BATTLE.updatedAt);
  const settingsTsRef = useRef<string>(DEFAULT_SETTINGS.updatedAt);
  const igTsRef = useRef<string>(DEFAULT_INSTAGRAM.lastUpdatedAt);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const applyBattleIfNewer = (next: ActiveBattle) => {
      if (isNewer(next.updatedAt, battleTsRef.current)) {
        battleTsRef.current = next.updatedAt;
        setBattle(next);
      }
    };
    const applySettingsIfNewer = (next: SiteSettings) => {
      if (isNewer(next.updatedAt, settingsTsRef.current)) {
        settingsTsRef.current = next.updatedAt;
        setSettings(next);
      }
    };
    const applyIgIfNewer = (next: InstagramSync) => {
      if (isNewer(next.lastUpdatedAt, igTsRef.current)) {
        igTsRef.current = next.lastUpdatedAt;
        setInstagram(next);
      }
    };

    const unsubFirestore = subscribePublicBattleState({
      onBattle: applyBattleIfNewer,
      onSettings: applySettingsIfNewer,
      onInstagram: applyIgIfNewer,
      onCountries: setCountries,
      onHistory: setHistory,
    });

    const pullServerState = async () => {
      const srv = await fetchServerBattleState();
      if (!srv) return;
      applyBattleIfNewer(srv.battle);
      applySettingsIfNewer(srv.settings);
      applyIgIfNewer(srv.instagram);
      if (srv.history.length > 0) {
        setHistory((curr) => (srv.history.length >= curr.length ? srv.history : curr));
      }
      if (srv.countryOverrides.length > 0 || srv.removedCountryCodes.length > 0) {
        const overrideMap = new Map(srv.countryOverrides.map((c) => [c.code, c]));
        const removed = new Set(srv.removedCountryCodes);
        const merged = WORLD_COUNTRIES.filter((c) => !removed.has(c.code)).map(
          (c) => overrideMap.get(c.code) ?? c
        );
        overrideMap.forEach((c, code) => {
          if (!WORLD_COUNTRIES.some((w) => w.code === code) && !removed.has(code)) {
            merged.unshift(c);
          }
        });
        setCountries(merged);
      }
    };

    void pullServerState();
    const unsubLocal = subscribeLocalSyncSignal(() => {
      void pullServerState();
    });
    const pollId = window.setInterval(() => {
      void pullServerState();
    }, 1500);

    return () => {
      unsubFirestore();
      unsubLocal();
      window.clearInterval(pollId);
    };
  }, []);

  const showAdmin = isAdminRouteHash(hash);

  return (
    <ErrorBoundary>
      {showAdmin ? (
        <AdminPanel
          battle={battle}
          settings={settings}
          instagram={instagram}
          countries={countries}
          history={history}
          firebaseUser={firebaseUser}
        />
      ) : (
        <SpectatorArena
          battle={battle}
          settings={settings}
          instagram={instagram}
          onSyncNow={() => {
            void fetchServerBattleState().then((srv) => {
              if (!srv) return;
              if (isNewer(srv.battle.updatedAt, battleTsRef.current)) {
                battleTsRef.current = srv.battle.updatedAt;
                setBattle(srv.battle);
              }
            });
          }}
        />
      )}
    </ErrorBoundary>
  );
}
