import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Coins,
  Copy,
  Download,
  Flame,
  Gauge,
  Home,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sliders,
  Smartphone,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { GarageModal, MissionsModal, SettingsModal } from './components/Modals';
import { GameEngine } from './game/GameEngine';
import { CAR_SKINS, loadSaveData, saveGameData } from './game/storage';
import {
  CarUpgrades,
  FlightState,
  GameState,
  LiveHudState,
  SaveData,
} from './game/types';
import { ADMOB_CONFIG, ANDROID_MANIFEST_META_DATA_SNIPPET, adMobService } from './services/admob';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const [activeModal, setActiveModal] = useState<
    'NONE' | 'GARAGE' | 'MISSIONS' | 'SETTINGS' | 'APK_DOWNLOAD'
  >('NONE');
  const [showcaseFlight, setShowcaseFlight] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [hud, setHud] = useState<LiveHudState>(() => ({
    gameState: GameState.MENU,
    flightState: FlightState.GROUNDED,
    countdownValue: 3,
    score: 0,
    distance: 0,
    runCoins: 0,
    totalCoins: saveData.coins,
    speedKmh: 122,
    flightEnergy: 100,
    maxFlightEnergy: 100,
    altitudeMeters: 0,
    altitudeTier: 0,
    turboRemaining: 0,
    shieldRemaining: 0,
    magnetRemaining: 0,
    hasShield: false,
    comboMultiplier: 1,
    comboCount: 0,
    nearMisses: 0,
    skyClears: 0,
    orbsCollected: 0,
    notification: null,
    scoreFeedback: null,
    activeTheme: 'NIGHT',
  }));

  useEffect(() => {
    if (!canvasMountRef.current) return;

    const initialSave = loadSaveData();
    const engine = new GameEngine(
      canvasMountRef.current,
      initialSave,
      (nextHud) => setHud(nextHud),
      (nextSave) => setSaveData(nextSave)
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Initialize Native Google AdMob in background & listen for Android WebAPK install prompt
  useEffect(() => {
    const bootAdMob = async () => {
      await adMobService.initialize();
      await adMobService.showAppOpenAd();
      await adMobService.showBottomBannerAd();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        adMobService.showAppOpenAd();
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    bootAdMob();
    document.addEventListener('deviceready', bootAdMob);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      document.removeEventListener('deviceready', bootAdMob);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleDirectApkInstallOrModal = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPrompt(null);
        return;
      }
    }
    setActiveModal('APK_DOWNLOAD');
  };

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(key);
    window.setTimeout(() => setCopiedField(null), 1800);
  };

  const updateAndPersistSave = (mutator: (draft: SaveData) => void) => {
    setSaveData((prev) => {
      const next: SaveData = {
        ...prev,
        unlockedSkins: [...prev.unlockedSkins],
        upgrades: { ...prev.upgrades },
        missions: prev.missions.map((m) => ({ ...m })),
        settings: { ...prev.settings },
      };
      mutator(next);
      saveGameData(next);
      engineRef.current?.updateSaveData(next);
      return next;
    });
  };

  const handleSelectSkin = (skinId: string) => {
    updateAndPersistSave((draft) => {
      draft.selectedSkinId = skinId;
    });
  };

  const handleUnlockSkin = (skinId: string, price: number) => {
    updateAndPersistSave((draft) => {
      if (draft.coins >= price && !draft.unlockedSkins.includes(skinId)) {
        draft.coins -= price;
        draft.unlockedSkins.push(skinId);
        draft.selectedSkinId = skinId;
        engineRef.current?.sound.playCoin();
      }
    });
  };

  const handleUpgradeSystem = (key: keyof CarUpgrades, cost: number) => {
    updateAndPersistSave((draft) => {
      if (draft.coins >= cost && draft.upgrades[key] < 5) {
        draft.coins -= cost;
        draft.upgrades[key] += 1;
        engineRef.current?.sound.playEnergyOrb();
      }
    });
  };

  const handleClaimMission = (missionId: string) => {
    updateAndPersistSave((draft) => {
      const m = draft.missions.find((item) => item.id === missionId);
      if (m && m.completed && !m.claimed) {
        m.claimed = true;
        draft.coins += m.reward;
        engineRef.current?.sound.playCoin();
      }
    });
  };

  const handleUpdateSettings = (partial: Partial<SaveData['settings']>) => {
    updateAndPersistSave((draft) => {
      draft.settings = { ...draft.settings, ...partial };
    });
  };

  const toggleMenuShowcaseFlight = () => {
    const next = !showcaseFlight;
    setShowcaseFlight(next);
    engineRef.current?.setMenuShowcaseFlight(next);
    if (next) {
      engineRef.current?.sound.playTakeoff();
    } else {
      engineRef.current?.sound.playLanding();
    }
  };

  const currentSkin =
    CAR_SKINS.find((s) => s.id === saveData.selectedSkinId) || CAR_SKINS[0];
  const unclaimedMissionsCount = saveData.missions.filter(
    (m) => m.completed && !m.claimed
  ).length;
  const energyPct = Math.min(
    100,
    Math.max(0, Math.round((hud.flightEnergy / hud.maxFlightEnergy) * 100))
  );

  const notificationToneClasses: Record<string, string> = {
    cyan: 'text-cyan-300 border-cyan-400/40 bg-[#060a18]/82',
    gold: 'text-amber-300 border-amber-400/40 bg-[#060a18]/82',
    purple: 'text-purple-300 border-purple-400/40 bg-[#060a18]/82',
    emerald: 'text-emerald-300 border-emerald-400/40 bg-[#060a18]/82',
    rose: 'text-rose-300 border-rose-400/40 bg-[#060a18]/82',
  };

  const scoreDeltaToneClasses: Record<string, string> = {
    cyan: 'text-cyan-300',
    gold: 'text-amber-300',
    purple: 'text-purple-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#060814] select-none">
      {/* 1. Full-Viewport WebGL Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full z-0" />

      {/* =====================================================================
          2. HOME SCREEN (MENU STATE)
      ===================================================================== */}
      {hud.gameState === GameState.MENU && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between p-4 sm:p-6 pointer-events-none">
          {/* Top Bar: Bespoke SVG Game Logo & Persistent Player Stats */}
          <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
            <div className="flex items-center gap-3 bg-[#080d1e]/92 border border-cyan-500/30 rounded-2xl px-4 py-2.5 shadow-xl">
              <svg
                width="38"
                height="38"
                viewBox="0 0 44 44"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0"
              >
                <rect
                  x="2"
                  y="2"
                  width="40"
                  height="40"
                  rx="11"
                  fill="#0B132B"
                  stroke="#06B6D4"
                  strokeWidth="2"
                />
                <path
                  d="M7 24.5C9.5 19.5 14 16 21 15.5H28.5C32.5 16.5 35.5 19.5 37 23.5L35 26H9L7 24.5Z"
                  fill="#F8FAFC"
                />
                <path
                  d="M15.5 17C19 16.2 24.5 16.2 28.5 17.5L32 21H13L15.5 17Z"
                  fill="#0F172A"
                />
                <circle cx="14.5" cy="25.5" r="3.2" fill="#06B6D4" />
                <circle cx="29.5" cy="25.5" r="3.2" fill="#06B6D4" />
                <path
                  d="M13 29.5L11.5 38.5M16.5 29.5L16 39.5M27.5 29.5L28 39.5M31 29.5L32.5 38.5"
                  stroke="#38BDF8"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-bold font-display tracking-wider text-white leading-none">
                    FLYING CAR RUSH <span className="text-cyan-400">3D</span>
                  </h1>
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[10px] font-mono-num font-bold text-cyan-300">
                    v2.0
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentSkin.name} · Original Edition v2.0
                </p>
              </div>
            </div>

            {/* Best Score, Coin Balance & Direct APK Install Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDirectApkInstallOrModal}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 rounded-xl px-3 py-2 flex items-center gap-2 text-emerald-300 font-bold text-xs shadow-lg transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="text-left">
                  <div className="text-[9px] text-emerald-200/80 leading-none">ANDROID v2.0</div>
                  <div className="text-xs font-bold text-white leading-tight">DOWNLOAD APK</div>
                </div>
              </button>

              <div className="bg-[#080d1e]/92 border border-slate-800 rounded-xl px-3.5 py-2 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-400 leading-none">BEST SCORE</div>
                  <div className="text-sm font-bold font-mono-num text-white mt-0.5">
                    {saveData.bestScore.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="bg-[#080d1e]/92 border border-amber-500/30 rounded-xl px-3.5 py-2 flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-400 leading-none">COINS</div>
                  <div className="text-sm font-bold font-mono-num text-amber-300 mt-0.5">
                    {saveData.coins.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Unified Collapsible Bottom Control Dock */}
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center pointer-events-auto">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={toggleMenuShowcaseFlight}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#080d1e]/92 border border-cyan-500/40 text-xs font-semibold text-cyan-200 hover:text-white hover:border-cyan-400 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {showcaseFlight ? 'VTOL Jets: Active Hover' : 'VTOL Jets: Grounded Idle'}
                </span>
              </button>
              <button
                onClick={() => setDockCollapsed(!dockCollapsed)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#080d1e]/92 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {dockCollapsed ? '▴ Show Menu' : '▾ Hide HUD'}
              </button>
            </div>

            {!dockCollapsed && (
              <div className="w-full bg-[#080d1e]/95 border border-cyan-500/30 rounded-2xl p-3 sm:p-4 shadow-2xl space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <button
                    onClick={() => engineRef.current?.startRun()}
                    className="col-span-2 sm:col-span-1 min-h-[52px] px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform cursor-pointer"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>PLAY NOW</span>
                  </button>

                  <button
                    onClick={() => setActiveModal('GARAGE')}
                    className="min-h-[52px] px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Wrench className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Garage</span>
                  </button>

                  <button
                    onClick={() => setActiveModal('MISSIONS')}
                    className="min-h-[52px] px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Missions</span>
                    {unclaimedMissionsCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-bold bg-amber-400 text-slate-950 rounded">
                        {unclaimedMissionsCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveModal('SETTINGS')}
                    className="min-h-[52px] px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={handleDirectApkInstallOrModal}
                    className="col-span-2 sm:col-span-1 min-h-[52px] px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>APK v2.0</span>
                  </button>
                </div>

                <div className="text-center text-[11px] text-slate-400">
                  Swipe Left/Right or A/D: Steer · Swipe Up or Space: VTOL Flight · Swipe Down or S:
                  Land · Shift: Overdrive Turbo
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. GAMEPLAY HUD (COUNTDOWN & PLAYING STATES)
      ===================================================================== */}
      {(hud.gameState === GameState.PLAYING ||
        hud.gameState === GameState.COUNTDOWN ||
        hud.gameState === GameState.PAUSED) && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between p-3 sm:p-5 pointer-events-none">
          {/* Top Section: Main HUD Bar + Compact Non-Overlapping Top-Center Notification Slot */}
          <div className="flex flex-col items-center w-full">
            <div className="flex items-start justify-between gap-2 w-full">
              {/* Left Cluster: Score (+ Small Adjacent Score Feedback), Distance & Speed */}
              <div className="flex flex-col items-start">
                <div className="bg-[#080d1e]/90 border border-cyan-500/25 rounded-2xl px-3.5 py-2 flex items-center gap-3.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold">SCORE</span>
                      {hud.comboMultiplier > 1 && (
                        <span className="text-[10px] font-mono-num font-bold text-amber-300">
                          · x{hud.comboMultiplier}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg sm:text-xl font-bold font-mono-num text-white leading-tight">
                        {hud.score.toLocaleString()}
                      </span>
                      {/* Small HUD-Adjacent Score Feedback (+20, +45) */}
                      {hud.scoreFeedback && (
                        <span
                          key={hud.scoreFeedback.id}
                          className={`text-[11px] font-mono-num font-bold transition-opacity duration-150 ${
                            hud.scoreFeedback.remainingMs <= 160 ? 'opacity-0' : 'opacity-100'
                          } ${scoreDeltaToneClasses[hud.scoreFeedback.tone] || 'text-amber-300'}`}
                        >
                          {hud.scoreFeedback.text}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-7 w-px bg-slate-800" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold">DISTANCE</div>
                    <div className="text-sm sm:text-base font-bold font-mono-num text-cyan-300 leading-tight">
                      {hud.distance}m
                    </div>
                  </div>
                  <div className="hidden sm:block h-7 w-px bg-slate-800" />
                  <div className="hidden sm:flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">SPEED</div>
                      <div className="text-sm font-bold font-mono-num text-purple-200 leading-tight">
                        {hud.speedKmh} km/h
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Cluster: VTOL Flight Energy Bar & Active Powerup Timers */}
              <div className="flex flex-col items-center gap-1 max-w-[190px] sm:max-w-[260px] w-full">
                <div className="w-full bg-[#080d1e]/92 border border-cyan-500/35 rounded-xl px-3 py-1.5">
                  <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold mb-1">
                    <span className="text-cyan-300 flex items-center gap-1 truncate">
                      <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                      {hud.flightState === FlightState.GROUNDED
                        ? 'VTOL ENERGY'
                        : hud.altitudeTier === 2
                        ? 'HIGH ALTITUDE'
                        : 'VTOL HOVER'}
                    </span>
                    <span className="font-mono-num text-white shrink-0">{energyPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-100 ${
                        energyPct < 20
                          ? 'bg-rose-500'
                          : hud.flightState !== FlightState.GROUNDED
                          ? 'bg-gradient-to-r from-white via-cyan-400 to-purple-500'
                          : 'bg-cyan-400'
                      }`}
                      style={{ width: `${energyPct}%` }}
                    />
                  </div>
                </div>

                {/* Compact Powerup Timer Strip */}
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <span className="sm:hidden bg-[#080d1e]/85 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono-num text-purple-200">
                    {hud.speedKmh} km/h
                  </span>
                  {hud.turboRemaining > 0 && (
                    <span className="bg-cyan-500/20 border border-cyan-400/40 rounded px-1.5 py-0.5 text-[10px] font-mono-num font-bold text-cyan-200 flex items-center gap-1">
                      <Flame className="w-2.5 h-2.5 text-cyan-300" />
                      {hud.turboRemaining}s
                    </span>
                  )}
                  {hud.hasShield && (
                    <span className="bg-emerald-500/20 border border-emerald-400/40 rounded px-1.5 py-0.5 text-[10px] font-mono-num font-bold text-emerald-200 flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5 text-emerald-300" />
                      {hud.shieldRemaining}s
                    </span>
                  )}
                  {hud.magnetRemaining > 0 && (
                    <span className="bg-amber-500/20 border border-amber-400/40 rounded px-1.5 py-0.5 text-[10px] font-mono-num font-bold text-amber-200 flex items-center gap-1">
                      <Magnet className="w-2.5 h-2.5 text-amber-300" />
                      {hud.magnetRemaining}s
                    </span>
                  )}
                </div>
              </div>

              {/* Right Cluster: Coins & Pause Button */}
              <div className="flex items-center gap-2 pointer-events-auto">
                <div className="bg-[#080d1e]/90 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-bold font-mono-num text-amber-300">
                    {hud.runCoins}
                  </span>
                </div>

                <button
                  onClick={() => engineRef.current?.pauseGame()}
                  aria-label="Pause Game"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-[#080d1e]/92 border border-slate-700 hover:border-cyan-400 text-white flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                >
                  <Pause className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Dedicated Compact Top-Center Notification Area (Below HUD, Never Covers Car/Road) */}
            <div className="h-7 mt-1.5 flex items-center justify-center pointer-events-none">
              {hud.gameState === GameState.PLAYING && hud.notification && (
                <div
                  key={hud.notification.id}
                  className={`px-2.5 py-0.5 rounded-md border text-[11px] sm:text-xs font-display font-bold tracking-wide flex items-center gap-1.5 transition-all duration-150 ${
                    hud.notification.fadingOut
                      ? '-translate-y-1.5 opacity-0'
                      : 'translate-y-0 opacity-100'
                  } ${
                    notificationToneClasses[hud.notification.tone] ||
                    notificationToneClasses.cyan
                  }`}
                >
                  <span>{hud.notification.text}</span>
                  {hud.notification.subtext && (
                    <span className="text-[10px] font-mono-num opacity-90">
                      · {hud.notification.subtext}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Pre-Run Launch Countdown (Only shown before PLAYING starts) */}
          {hud.gameState === GameState.COUNTDOWN && (
            <div className="flex flex-col items-center justify-center my-auto pointer-events-none">
              <div className="bg-[#080d1e]/92 border border-cyan-400/60 rounded-2xl px-8 py-4 text-center shadow-xl">
                <div className="text-[10px] font-bold tracking-widest text-cyan-300 mb-0.5">
                  VTOL LAUNCH SEQUENCE
                </div>
                <div className="text-4xl sm:text-5xl font-bold font-display text-white font-mono-num">
                  {hud.countdownValue > 0 ? hud.countdownValue : 'GO!'}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Ergonomic Thumb-Zone Touch Controls */}
          {saveData.settings.showTouchButtons && (
            <div className="flex items-end justify-between w-full gap-4 pb-1 sm:pb-2 pointer-events-auto mt-auto">
              {/* Left Thumb Cluster: Lane Left / Lane Right */}
              <div className="flex items-center gap-2.5">
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    engineRef.current?.moveLeft();
                  }}
                  aria-label="Steer Left"
                  className="w-15 h-15 sm:w-16 sm:h-16 rounded-2xl bg-[#080d1e]/88 border border-cyan-500/35 active:bg-cyan-500/30 text-white flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                >
                  <ArrowLeft className="w-6 h-6 text-cyan-300" />
                  <span className="text-[10px] font-bold text-slate-300">LEFT</span>
                </button>

                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    engineRef.current?.moveRight();
                  }}
                  aria-label="Steer Right"
                  className="w-15 h-15 sm:w-16 sm:h-16 rounded-2xl bg-[#080d1e]/88 border border-cyan-500/35 active:bg-cyan-500/30 text-white flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                >
                  <ArrowRight className="w-6 h-6 text-cyan-300" />
                  <span className="text-[10px] font-bold text-slate-300">RIGHT</span>
                </button>
              </div>

              {/* Right Thumb Cluster: Turbo Overdrive & Smart Fly/Land Toggle Button */}
              <div className="flex items-center gap-2.5">
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    engineRef.current?.triggerManualTurbo();
                  }}
                  disabled={hud.flightEnergy < 40 || hud.turboRemaining > 0}
                  aria-label="Activate Overdrive Turbo"
                  className={`w-14 h-15 sm:w-15 sm:h-16 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-transform cursor-pointer ${
                    hud.flightEnergy >= 40 && hud.turboRemaining <= 0
                      ? 'bg-[#080d1e]/88 border-amber-400/50 text-amber-300 active:scale-95'
                      : 'bg-[#080d1e]/60 border-slate-800 text-slate-600'
                  }`}
                >
                  <Flame className="w-5 h-5" />
                  <span className="text-[10px] font-bold">TURBO</span>
                </button>

                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    engineRef.current?.toggleFlight();
                  }}
                  aria-label={
                    hud.flightState === FlightState.GROUNDED ||
                    hud.flightState === FlightState.DESCENDING
                      ? 'Take Off'
                      : 'Land'
                  }
                  className={`w-18 h-15 sm:w-20 sm:h-16 rounded-2xl border flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform shadow-lg cursor-pointer ${
                    hud.flightState === FlightState.GROUNDED ||
                    hud.flightState === FlightState.DESCENDING
                      ? 'bg-gradient-to-b from-cyan-500/90 to-indigo-700/90 border-cyan-300/60 text-white shadow-cyan-500/30'
                      : 'bg-gradient-to-b from-purple-600/90 to-slate-900/95 border-purple-300/70 text-cyan-200 shadow-purple-500/30'
                  }`}
                >
                  {hud.flightState === FlightState.GROUNDED ||
                  hud.flightState === FlightState.DESCENDING ? (
                    <>
                      <ArrowUp className="w-6 h-6 text-white" />
                      <span className="text-[10px] font-bold tracking-wider">FLY UP</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-6 h-6 text-cyan-200" />
                      <span className="text-[10px] font-bold tracking-wider">LAND</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          4. PAUSE MODAL (PAUSED STATE)
      ===================================================================== */}
      {hud.gameState === GameState.PAUSED && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 pointer-events-auto">
          <div className="w-full max-w-sm bg-[#0a0f20] border border-cyan-500/35 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold font-display tracking-wide text-white">
                GAME PAUSED
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Score: {hud.score.toLocaleString()} · Distance: {hud.distance}m
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() =>
                  handleUpdateSettings({ sfxEnabled: !saveData.settings.sfxEnabled })
                }
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                {saveData.settings.sfxEnabled ? (
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
                <span>SFX: {saveData.settings.sfxEnabled ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={() =>
                  handleUpdateSettings({ musicEnabled: !saveData.settings.musicEnabled })
                }
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                {saveData.settings.musicEnabled ? (
                  <Volume2 className="w-4 h-4 text-purple-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
                <span>Music: {saveData.settings.musicEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => engineRef.current?.resumeGame()}
                className="w-full min-h-[48px] rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>RESUME RUN</span>
              </button>

              <button
                onClick={() => engineRef.current?.restartGame()}
                className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Restart Run</span>
              </button>

              <button
                onClick={() => engineRef.current?.returnToMenu()}
                className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Home Menu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. GAME OVER SCREEN (GAME_OVER STATE)
      ===================================================================== */}
      {hud.gameState === GameState.GAME_OVER && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/82 pointer-events-auto">
          <div className="w-full max-w-md bg-[#0a0f20] border border-purple-500/40 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="text-center space-y-1">
              <div className="text-xs font-bold tracking-widest text-rose-400">
                RUN TERMINATED — COLLISION DETECTED
              </div>
              <h2 className="text-3xl font-bold font-display text-white">RUN SUMMARY</h2>
              {hud.score >= saveData.bestScore && hud.score > 0 && (
                <p className="text-xs font-semibold text-amber-300">
                  NEW PERSONAL BEST SCORE!
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-xs text-slate-400">Final Score</div>
                <div className="text-2xl font-bold font-mono-num text-white mt-0.5">
                  {hud.score.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono-num text-cyan-400 mt-1">
                  Best: {saveData.bestScore.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-xs text-slate-400">Distance Travelled</div>
                <div className="text-2xl font-bold font-mono-num text-cyan-300 mt-0.5">
                  {hud.distance}m
                </div>
                <div className="text-[11px] font-mono-num text-slate-400 mt-1">
                  Best: {saveData.bestDistance}m
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-xs text-slate-400">Coins Collected</div>
                <div className="text-xl font-bold font-mono-num text-amber-300 mt-0.5 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span>+{hud.runCoins}</span>
                </div>
                <div className="text-[11px] font-mono-num text-slate-400 mt-1">
                  Balance: {saveData.coins.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-xs text-slate-400">Sky Clears & Near Misses</div>
                <div className="text-xl font-bold font-mono-num text-purple-300 mt-0.5 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span>{hud.skyClears + hud.nearMisses}</span>
                </div>
                <div className="text-[11px] font-mono-num text-slate-400 mt-1">
                  Clears: {hud.skyClears} · Near Miss: {hud.nearMisses}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => engineRef.current?.returnToMenu()}
                className="min-h-[50px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </button>

              <button
                onClick={() => engineRef.current?.restartGame()}
                className="min-h-[50px] rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-transform active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RETRY RUN</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. GARAGE, MISSIONS & SETTINGS MODALS
      ===================================================================== */}
      {activeModal === 'GARAGE' && (
        <GarageModal
          saveData={saveData}
          onSelectSkin={handleSelectSkin}
          onUnlockSkin={handleUnlockSkin}
          onUpgradeSystem={handleUpgradeSystem}
          onClose={() => setActiveModal('NONE')}
        />
      )}

      {activeModal === 'MISSIONS' && (
        <MissionsModal
          saveData={saveData}
          onClaimMission={handleClaimMission}
          onClose={() => setActiveModal('NONE')}
        />
      )}

      {activeModal === 'SETTINGS' && (
        <SettingsModal
          saveData={saveData}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setActiveModal('NONE')}
        />
      )}

      {/* =====================================================================
          7. DIRECT APK DOWNLOAD / INSTALL MODAL (v2.0 ORIGINAL EDITION)
      ===================================================================== */}
      {activeModal === 'APK_DOWNLOAD' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/82 pointer-events-auto">
          <div className="w-full max-w-lg bg-[#0a0f20] border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold font-display text-white">
                    FLYING CAR RUSH 3D · v2.0 APK
                  </h2>
                  <p className="text-xs text-slate-400">
                    Original Clean Game Edition + Native AdMob Ready
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal('NONE')}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option 1: Direct Android Install (WebAPK) */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-2.5">
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                <span>OPTION 1: DIRECT ANDROID INSTALL (v2.0)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Apne Android phone ke Chrome browser mein is game ko khol kar neeche button dabayein
                ya browser menu (⋮) se <strong>&ldquo;Install App / Add to Home Screen&rdquo;</strong> par tap karein:
              </p>
              {installPrompt ? (
                <button
                  onClick={handleDirectApkInstallOrModal}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>INSTALL FLYING CAR RUSH 3D v2.0 NOW</span>
                </button>
              ) : (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between gap-2">
                  <span className="truncate font-mono-num">{window.location.origin}</span>
                  <button
                    onClick={() => handleCopyText('url', window.location.origin)}
                    className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedField === 'url' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Game URL</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Option 2: Pre-Configured AdMob IDs & AndroidManifest.xml */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="text-xs font-bold text-cyan-300">
                INTEGRATED GOOGLE ADMOB IDS (BACKGROUND SDK ACTIVE)
              </div>
              <div className="text-[11px] font-mono-num text-slate-300 space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <div>App ID: {ADMOB_CONFIG.APP_ID}</div>
                <div>App Open: {ADMOB_CONFIG.APP_OPEN_AD_ID}</div>
                <div>Banner: {ADMOB_CONFIG.BANNER_AD_ID}</div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  AndroidManifest.xml &lt;meta-data&gt; tag:
                </span>
                <button
                  onClick={() =>
                    handleCopyText('manifest', ANDROID_MANIFEST_META_DATA_SNIPPET)
                  }
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'manifest' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Tag</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => setActiveModal('NONE')}
              className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
