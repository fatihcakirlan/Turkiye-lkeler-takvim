import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { AdminPanel } from './components/AdminPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpectatorArena } from './components/SpectatorArena';
import { WORLD_COUNTRIES } from './data/countries';
import {
  DEFAULT_BATTLE,
  DEFAULT_INSTAGRAM,
  DEFAULT_SETTINGS,
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

export default function App() {
  const [hash, setHash] = useState<string>(() => window.location.hash);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [battle, setBattle] = useState<ActiveBattle>(DEFAULT_BATTLE);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [instagram, setInstagram] = useState<InstagramSync>(DEFAULT_INSTAGRAM);
  const [countries, setCountries] = useState<Country[]>(WORLD_COUNTRIES);
  const [history, setHistory] = useState<BattleHistoryEntry[]>([]);

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
    const unsub = subscribePublicBattleState({
      onBattle: setBattle,
      onSettings: setSettings,
      onInstagram: setInstagram,
      onCountries: setCountries,
      onHistory: setHistory,
    });

    // Also pull latest cached server Instagram state on boot if Firestore doc is still pending
    fetch('/api/instagram/status')
      .then((r) => r.json())
      .then((srvIg: InstagramSync) => {
        if (srvIg && typeof srvIg.lastValidFollowers === 'number') {
          setInstagram((curr) =>
            curr.syncStatus === 'pending' ? { ...curr, ...srvIg } : curr
          );
        }
      })
      .catch(() => {});

    return () => unsub();
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
        <SpectatorArena battle={battle} settings={settings} instagram={instagram} />
      )}
    </ErrorBoundary>
  );
}
