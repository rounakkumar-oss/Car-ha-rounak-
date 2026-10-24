import React, { useState } from 'react';
import {
  Check,
  Coins,
  Cpu,
  Flame,
  Lock,
  Shield,
  Sliders,
  Smartphone,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { CAR_SKINS, UPGRADE_COSTS } from '../game/storage';
import { CarUpgrades, EnvironmentTheme, SaveData } from '../game/types';

interface GarageModalProps {
  saveData: SaveData;
  onSelectSkin: (skinId: string) => void;
  onUnlockSkin: (skinId: string, price: number) => void;
  onUpgradeSystem: (key: keyof CarUpgrades, cost: number) => void;
  onClose: () => void;
}

export const GarageModal: React.FC<GarageModalProps> = ({
  saveData,
  onSelectSkin,
  onUnlockSkin,
  onUpgradeSystem,
  onClose,
}) => {
  const [tab, setTab] = useState<'SKINS' | 'UPGRADES' | 'CONCEPT'>('SKINS');

  const upgradeItems: {
    key: keyof CarUpgrades;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'thrusterLevel',
      title: 'VTOL Ion Thrusters',
      desc: 'Increases maximum flight energy capacity and speeds up ground recharge.',
      icon: <Zap className="w-5 h-5 text-cyan-400" />,
    },
    {
      key: 'turboLevel',
      title: 'Aero Plasma Turbo',
      desc: 'Extends turbo boost duration and increases top speed multiplier.',
      icon: <Flame className="w-5 h-5 text-purple-400" />,
    },
    {
      key: 'shieldLevel',
      title: 'Deflector Shield Matrix',
      desc: 'Extends active duration of the geodesic collision protection shield.',
      icon: <Shield className="w-5 h-5 text-emerald-400" />,
    },
    {
      key: 'magnetLevel',
      title: 'Coin Attractor Array',
      desc: 'Widens magnetic pickup field to pull gold coins from adjacent lanes.',
      icon: <Coins className="w-5 h-5 text-amber-400" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto">
      <div className="w-full max-w-2xl bg-[#0a0f20] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide text-white">
              AERO GARAGE & ENGINEERING
            </h2>
            <p className="text-xs text-slate-400">
              Customize your flying electric sports car and upgrade propulsion systems
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-amber-500/30 text-amber-300 font-mono-num text-sm font-semibold">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{saveData.coins}</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close garage"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Segmented Tabs */}
        <div className="flex items-center gap-2 px-6 pt-4">
          <button
            onClick={() => setTab('SKINS')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              tab === 'SKINS'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            Car Paint & Thrusters ({saveData.unlockedSkins.length}/{CAR_SKINS.length})
          </button>
          <button
            onClick={() => setTab('UPGRADES')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              tab === 'UPGRADES'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            Flight & Performance Upgrades
          </button>
          <button
            onClick={() => setTab('CONCEPT')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              tab === 'CONCEPT'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            Visual Inspiration
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-3">
          {tab === 'SKINS' &&
            CAR_SKINS.map((skin) => {
              const isUnlocked = saveData.unlockedSkins.includes(skin.id);
              const isSelected = saveData.selectedSkinId === skin.id;
              const canAfford = saveData.coins >= skin.price;

              return (
                <div
                  key={skin.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
                    isSelected
                      ? 'bg-slate-900/95 border-cyan-400'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Swatch Preview */}
                    <div
                      className="w-12 h-12 rounded-xl border border-white/20 shrink-0 flex items-center justify-center relative overflow-hidden"
                      style={{
                        backgroundColor: `#${skin.bodyColor.toString(16).padStart(6, '0')}`,
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-full border border-black/40"
                        style={{
                          backgroundColor: `#${skin.thrusterColor.toString(16).padStart(6, '0')}`,
                        }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{skin.name}</h3>
                        <span className="text-xs text-slate-400">
                          {isSelected ? '· Active' : isUnlocked ? '· Owned' : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{skin.subtitle}</p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isSelected ? (
                      <button
                        disabled
                        className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-4 h-4" /> Equipped
                      </button>
                    ) : isUnlocked ? (
                      <button
                        onClick={() => onSelectSkin(skin.id)}
                        className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-white text-xs font-semibold transition-colors"
                      >
                        Equip Skin
                      </button>
                    ) : (
                      <button
                        disabled={!canAfford}
                        onClick={() => onUnlockSkin(skin.id, skin.price)}
                        className={`w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          canAfford
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Unlock · {skin.price} Coins</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          {tab === 'UPGRADES' &&
            upgradeItems.map((item) => {
              const currentLvl = saveData.upgrades[item.key];
              const isMax = currentLvl >= 5;
              const nextCost = UPGRADE_COSTS[currentLvl] || 999;
              const canAfford = saveData.coins >= nextCost;

              return (
                <div
                  key={item.key}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                      {item.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{item.title}</h3>
                        <span className="text-xs font-mono-num text-cyan-400">
                          · Level {currentLvl}/5
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                      {/* Level Bar */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {[1, 2, 3, 4, 5].map((step) => (
                          <div
                            key={step}
                            className={`h-1.5 w-8 rounded-full ${
                              step <= currentLvl ? 'bg-cyan-400' : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isMax ? (
                      <span className="inline-flex min-h-[44px] items-center px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-semibold">
                        Max Level
                      </span>
                    ) : (
                      <button
                        disabled={!canAfford}
                        onClick={() => onUpgradeSystem(item.key, nextCost)}
                        className={`w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          canAfford
                            ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Upgrade · {nextCost} Coins</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          {tab === 'CONCEPT' && (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                <img
                  src="/assets/aistudio/IMG_f39a379c-4637-4f3e-a1cf-ad62d2457ead_38d05794.jpg"
                  alt="Futuristic White Flying Electric Sports Car Reference"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-center"
                />
              </div>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-white">
                  3D Procedural Vehicle Architecture
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Inspired by your concept reference, the playable 3D vehicle features a sculpted
                  pearl-white aerodynamic wedge hull, dark panoramic teardrop glass canopy, enclosed
                  turbine wheel shrouds with illuminated rims, wrap-around crimson LED tailbar, and
                  four vertical blue-violet ion thrusters underneath that ignite during VTOL flight.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface MissionsModalProps {
  saveData: SaveData;
  onClaimMission: (missionId: string) => void;
  onClose: () => void;
}

export const MissionsModal: React.FC<MissionsModalProps> = ({
  saveData,
  onClaimMission,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto">
      <div className="w-full max-w-xl bg-[#0a0f20] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-purple-400" />
            <div>
              <h2 className="text-xl font-bold font-display tracking-wide text-white">
                FLIGHT MISSIONS
              </h2>
              <p className="text-xs text-slate-400">
                Complete objectives during runs to earn extra Gold Coins
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close missions"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3">
          {saveData.missions.map((m) => {
            const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
            return (
              <div
                key={m.id}
                className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <h3 className="text-sm font-bold text-white">{m.title}</h3>
                    <span className="text-xs font-mono-num text-amber-300">
                      · +{m.reward} Coins
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{m.description}</p>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-400 to-purple-500 h-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[11px] font-mono-num text-slate-400">
                    Progress: {m.progress} / {m.target} ({pct}%)
                  </div>
                </div>

                <div className="shrink-0">
                  {m.claimed ? (
                    <span className="inline-flex min-h-[44px] items-center px-4 py-2 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold gap-1.5">
                      <Check className="w-4 h-4 text-emerald-400" /> Claimed
                    </span>
                  ) : m.completed ? (
                    <button
                      onClick={() => onClaimMission(m.id)}
                      className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Claim +{m.reward}</span>
                    </button>
                  ) : (
                    <span className="inline-flex min-h-[44px] items-center px-3 py-2 rounded-lg bg-slate-950 text-slate-500 text-xs font-semibold">
                      In Progress
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  saveData: SaveData;
  onUpdateSettings: (partial: Partial<SaveData['settings']>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  saveData,
  onUpdateSettings,
  onClose,
}) => {
  const [showApkGuide, setShowApkGuide] = useState(false);
  const { settings } = saveData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto">
      <div className="w-full max-w-xl bg-[#0a0f20] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold font-display tracking-wide text-white">
              SETTINGS & ANDROID APK HANDOFF
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {/* Audio Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => onUpdateSettings({ sfxEnabled: !settings.sfxEnabled })}
              className="min-h-[52px] p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-left hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                {settings.sfxEnabled ? (
                  <Volume2 className="w-5 h-5 text-cyan-400" />
                ) : (
                  <VolumeX className="w-5 h-5 text-slate-500" />
                )}
                <div>
                  <div className="text-sm font-semibold text-white">Sound Effects</div>
                  <div className="text-xs text-slate-400">Engine, thrusters & pickups</div>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded ${
                  settings.sfxEnabled
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {settings.sfxEnabled ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              onClick={() => onUpdateSettings({ musicEnabled: !settings.musicEnabled })}
              className="min-h-[52px] p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-left hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                {settings.musicEnabled ? (
                  <Volume2 className="w-5 h-5 text-purple-400" />
                ) : (
                  <VolumeX className="w-5 h-5 text-slate-500" />
                )}
                <div>
                  <div className="text-sm font-semibold text-white">Synth Music</div>
                  <div className="text-xs text-slate-400">Cyber-drive bass sequencer</div>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded ${
                  settings.musicEnabled
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {settings.musicEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Touch Controls & Graphics Quality */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => onUpdateSettings({ showTouchButtons: !settings.showTouchButtons })}
              className="min-h-[52px] p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-left hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="text-sm font-semibold text-white">On-Screen Buttons</div>
                  <div className="text-xs text-slate-400">Show Left/Right/Fly buttons</div>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded ${
                  settings.showTouchButtons
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {settings.showTouchButtons ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              onClick={() =>
                onUpdateSettings({ highQualityGraphics: !settings.highQualityGraphics })
              }
              className="min-h-[52px] p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-left hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-sm font-semibold text-white">High-Res Shadows</div>
                  <div className="text-xs text-slate-400">Toggle for mid-range phones</div>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded ${
                  settings.highQualityGraphics
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {settings.highQualityGraphics ? 'HIGH' : 'FAST'}
              </span>
            </button>
          </div>

          {/* Environment Theme Selector */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold text-slate-300">
              Highway Atmosphere & Lighting Cycle
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: EnvironmentTheme.DYNAMIC, label: 'Dynamic Cycle' },
                  { id: EnvironmentTheme.NIGHT, label: 'Cyber Night' },
                  { id: EnvironmentTheme.SUNSET, label: 'Neon Sunset' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onUpdateSettings({ environmentTheme: opt.id })}
                  className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    settings.environmentTheme === opt.id
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-950 text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Android APK Packaging Guide Accordion */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/25 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Android APK Packaging & Capacitor Setup
                </h3>
                <p className="text-xs text-slate-400">
                  Pre-configured with capacitor.config.json & fullscreen WebView manifest
                </p>
              </div>
              <button
                onClick={() => setShowApkGuide(!showApkGuide)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {showApkGuide ? 'Hide Steps' : 'View APK Steps'}
              </button>
            </div>

            {showApkGuide && (
              <div className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800 font-mono-num">
                <p className="text-slate-400 font-sans">
                  This web container does not include the Android SDK/Gradle binary toolchain, so
                  the project includes <code className="text-cyan-300">capacitor.config.json</code>{' '}
                  and <code className="text-cyan-300">public/manifest.json</code> ready to build
                  locally:
                </p>
                <div className="p-3 rounded-lg bg-slate-950 text-cyan-300 overflow-x-auto space-y-1">
                  <div>1. npm install @capacitor/core @capacitor/cli @capacitor/android</div>
                  <div>2. npm run build</div>
                  <div>3. npx cap add android</div>
                  <div>4. npx cap sync android</div>
                  <div>5. cd android && ./gradlew assembleRelease</div>
                </div>
                <p className="text-slate-400 font-sans">
                  See <code className="text-cyan-300">README.md</code> in the project root for full
                  keysigning (<code className="text-cyan-300">keytool</code> &{' '}
                  <code className="text-cyan-300">apksigner</code>) instructions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
