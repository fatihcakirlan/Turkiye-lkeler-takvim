import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Shield, Trophy, UserPlus } from 'lucide-react';
import { ActiveBattle, InstagramSync, SiteSettings } from '../types/battle';
import { Battlefield3D } from './Battlefield3D';
import { CountryFlag } from './CountryFlag';

interface SpectatorArenaProps {
  battle: ActiveBattle;
  settings: SiteSettings;
  instagram: InstagramSync;
  onSyncNow?: () => void;
}

const STATUS_LABELS: Record<ActiveBattle['status'], string> = {
  idle: '',
  countdown: 'Geri Sayım',
  wall_lowering: 'Duvar İniyor',
  fighting: 'Canlı Savaş',
  finished: 'Bitti',
};

function formatSoldierCount(n: number): string {
  return String(Math.max(0, Math.round(n)));
}

interface CountdownDetails {
  remainingMs: number;
  text: string;
  targetClock: string;
}

function getCountdownDetails(targetIso?: string): CountdownDetails | null {
  if (!targetIso) return null;
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) return null;
  const diff = Math.max(0, targetMs - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  let text = '';
  if (days > 0) {
    text = `${days} gün ${String(hrs).padStart(2, '0')} sa ${String(mins).padStart(2, '0')} dk ${String(secs).padStart(2, '0')} sn`;
  } else if (hrs > 0) {
    text = `${String(hrs).padStart(2, '0')} sa ${String(mins).padStart(2, '0')} dk ${String(secs).padStart(2, '0')} sn`;
  } else if (mins > 0) {
    text = `${String(mins).padStart(2, '0')} dk ${String(secs).padStart(2, '0')} sn`;
  } else {
    text = `${secs} sn`;
  }

  const targetClock = new Date(targetMs).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return { remainingMs: diff, text, targetClock };
}

export const SpectatorArena: React.FC<SpectatorArenaProps> = ({
  battle,
  settings,
  instagram,
  onSyncNow,
}) => {
  const [cameraPreset, setCameraPreset] = useState(settings.defaultCamera || 'overview');
  const isWaitingForStart = battle.status === 'idle' || battle.status === 'countdown';
  const [countdown, setCountdown] = useState<CountdownDetails | null>(() =>
    isWaitingForStart ? getCountdownDetails(battle.scheduledStartAt) : null
  );
  const [localDisplay, setLocalDisplay] = useState<{
    homeRem: number;
    oppRem: number;
    winner: ActiveBattle['winnerSide'];
  }>({
    homeRem: battle.homeRemaining,
    oppRem: battle.opponentRemaining,
    winner: battle.winnerSide,
  });

  useEffect(() => {
    setLocalDisplay({
      homeRem: battle.homeRemaining,
      oppRem: battle.opponentRemaining,
      winner: battle.winnerSide,
    });
  }, [battle.homeRemaining, battle.opponentRemaining, battle.winnerSide, battle.status]);

  useEffect(() => {
    setCameraPreset(settings.defaultCamera || 'overview');
  }, [settings.defaultCamera]);

  useEffect(() => {
    if (!isWaitingForStart || !battle.scheduledStartAt) {
      setCountdown(null);
      return;
    }

    let syncedOnZero = false;
    const tick = () => {
      const details = getCountdownDetails(battle.scheduledStartAt);
      setCountdown(details);
      if (details && details.remainingMs <= 0 && !syncedOnZero) {
        syncedOnZero = true;
        onSyncNow?.();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [battle.scheduledStartAt, isWaitingForStart, onSyncNow]);

  const effectiveBattle: ActiveBattle = useMemo(() => {
    if (battle.status === 'fighting') {
      return {
        ...battle,
        homeRemaining: localDisplay.homeRem,
        opponentRemaining: localDisplay.oppRem,
        winnerSide: localDisplay.winner !== 'none' ? localDisplay.winner : battle.winnerSide,
        status: localDisplay.winner !== 'none' ? 'finished' : battle.status,
        winnerName:
          localDisplay.winner === 'home'
            ? battle.homeCountryName
            : localDisplay.winner === 'opponent'
            ? battle.opponentCountryName
            : localDisplay.winner === 'draw'
            ? 'Berabere'
            : battle.winnerName,
      };
    }
    return battle;
  }, [battle, localDisplay]);

  const showWinnerBanner = effectiveBattle.status === 'finished' && effectiveBattle.winnerSide !== 'none';
  const igHandle = (instagram.handle || settings.instagramHandle || 'kirmizivemavitakim').replace(/^@/, '');
  const instagramFollowUrl = `https://www.instagram.com/${encodeURIComponent(igHandle)}/`;
  const activeStatusLabel = STATUS_LABELS[effectiveBattle.status];
  const showCountdownBar =
    (effectiveBattle.status === 'idle' || effectiveBattle.status === 'countdown') &&
    countdown !== null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#070B12] text-slate-100 select-none">
      {/* Full-Viewport 3D Battlefield */}
      <div className="absolute inset-0">
        <Battlefield3D
          battle={effectiveBattle}
          cameraPreset={cameraPreset}
          onCameraPresetChange={setCameraPreset}
          onLocalSimulationStep={(homeRem, oppRem, winner) => {
            setLocalDisplay({ homeRem, oppRem, winner });
          }}
        />
      </div>

      {/* Clean Top Matchup HUD: Türkiye 620 vs Almanya 3000 + Slogan + Asker Ol + Geri Sayım */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2 sm:p-3">
        <div className="mx-auto max-w-3xl rounded-xl bg-[#0B111C]/92 border border-slate-800 shadow-2xl px-2.5 py-2 sm:px-4 sm:py-2.5">
          {/* Primary Country Stats Row */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-3">
            {/* LEFT: Türkiye (Red) */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 rounded-lg bg-rose-950/35 border border-rose-500/30 px-2 py-1.5 sm:px-3 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <CountryFlag
                  code={effectiveBattle.opponentCountryCode}
                  flag={effectiveBattle.opponentFlag}
                  color={effectiveBattle.opponentColor}
                  name={effectiveBattle.opponentCountryName}
                  className="w-6 h-4 sm:w-8 sm:h-5"
                />
                <h2 className="font-display text-xs sm:text-base font-bold text-white truncate">
                  {effectiveBattle.opponentCountryName}
                </h2>
              </div>
              <span className="font-mono text-base sm:text-xl font-bold text-rose-400 tabular-nums shrink-0">
                {formatSoldierCount(effectiveBattle.opponentRemaining)}
              </span>
            </div>

            {/* CENTER: VS / Battle Status */}
            <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 text-center">
              <span className="font-display text-[11px] sm:text-sm font-bold tracking-wider text-slate-300">
                VS
              </span>
              {activeStatusLabel && (
                <span className="text-[10px] font-medium text-amber-300 whitespace-nowrap">
                  {activeStatusLabel}
                </span>
              )}
            </div>

            {/* RIGHT: Almanya (Blue) */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 rounded-lg bg-sky-950/35 border border-sky-500/30 px-2 py-1.5 sm:px-3 min-w-0">
              <span className="font-mono text-base sm:text-xl font-bold text-sky-400 tabular-nums shrink-0">
                {formatSoldierCount(effectiveBattle.homeRemaining)}
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 justify-end">
                <h2 className="font-display text-xs sm:text-base font-bold text-white truncate">
                  {effectiveBattle.homeCountryName}
                </h2>
                <CountryFlag
                  code={effectiveBattle.homeCountryCode}
                  flag={effectiveBattle.homeFlag}
                  color={effectiveBattle.homeColor}
                  name={effectiveBattle.homeCountryName}
                  className="w-6 h-4 sm:w-8 sm:h-5"
                />
              </div>
            </div>
          </div>

          {/* Slogan & Asker Ol CTA Strip */}
          <div className="mt-1.5 pt-1.5 sm:mt-2 sm:pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="font-display text-xs sm:text-sm font-semibold text-slate-100 truncate">
                Her Takip Bir Asker
              </p>
            </div>

            <a
              href={instagramFollowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Asker Ol</span>
            </a>
          </div>

          {/* Live Scheduled Battle Countdown Strip */}
          {showCountdownBar && countdown && (
            <div className="mt-1.5 pt-1.5 sm:mt-2 sm:pt-2 border-t border-amber-500/25 flex items-center justify-between gap-2 rounded-lg bg-amber-950/25 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-amber-200 min-w-0">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Savaşa Şu Kadar Süre Kaldı:</span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs sm:text-sm font-bold text-amber-300 tabular-nums whitespace-nowrap">
                  {countdown.remainingMs <= 0 ? 'Başlıyor...' : countdown.text}
                </span>
                <span className="hidden sm:inline text-[11px] text-amber-200/70 tabular-nums">
                  ({countdown.targetClock})
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Grand Winner Announcement Overlay */}
      {showWinnerBanner && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-6">
          <div className="animate-victory max-w-md w-full rounded-2xl bg-[#09101C]/95 border border-amber-400/50 p-7 text-center shadow-2xl">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-amber-500/15 border border-amber-400/40 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-amber-400" />
            </div>
            <p className="text-xs font-medium tracking-wider text-amber-300 uppercase">
              Savaş Zaferi
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              {effectiveBattle.winnerSide !== 'draw' && (
                <CountryFlag
                  code={
                    effectiveBattle.winnerSide === 'home'
                      ? effectiveBattle.homeCountryCode
                      : effectiveBattle.opponentCountryCode
                  }
                  flag={
                    effectiveBattle.winnerSide === 'home'
                      ? effectiveBattle.homeFlag
                      : effectiveBattle.opponentFlag
                  }
                  color={
                    effectiveBattle.winnerSide === 'home'
                      ? effectiveBattle.homeColor
                      : effectiveBattle.opponentColor
                  }
                  className="w-11 h-7"
                />
              )}
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {effectiveBattle.winnerSide === 'draw'
                  ? 'Berabere'
                  : `${effectiveBattle.winnerName || (effectiveBattle.winnerSide === 'home' ? effectiveBattle.homeCountryName : effectiveBattle.opponentCountryName)} Kazandı`}
              </h1>
            </div>
            <p className="mt-2.5 text-xs text-slate-300 tabular-nums">
              {effectiveBattle.opponentCountryName}: {formatSoldierCount(effectiveBattle.opponentRemaining)} ·{' '}
              {effectiveBattle.homeCountryName}: {formatSoldierCount(effectiveBattle.homeRemaining)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
