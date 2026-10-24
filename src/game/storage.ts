import { CarSkin, EnvironmentTheme, Mission, SaveData } from './types';

const STORAGE_KEY = 'flying_car_rush_3d_save_v1';

export const CAR_SKINS: CarSkin[] = [
  {
    id: 'aero_white',
    name: 'Aero White Prototype',
    subtitle: 'Original pearl-white electric flight coupe with blue-violet ion thrusters',
    price: 0,
    bodyColor: 0xf4f7fb,
    secondaryColor: 0x161b26,
    accentColor: 0x38bdf8,
    thrusterColor: 0x6366f1,
    thrusterCoreColor: 0x67e8f9,
    rimColor: 0x38bdf8,
    metalness: 0.35,
    roughness: 0.18,
  },
  {
    id: 'cyber_cyan',
    name: 'Cyber Cyan Interceptor',
    subtitle: 'Anodized electric cyan chassis with hyper-blue plasma thrusters',
    price: 150,
    bodyColor: 0x06b6d4,
    secondaryColor: 0x0f172a,
    accentColor: 0xa855f7,
    thrusterColor: 0x3b82f6,
    thrusterCoreColor: 0xe0f2fe,
    rimColor: 0x22d3ee,
    metalness: 0.75,
    roughness: 0.16,
  },
  {
    id: 'obsidian_stealth',
    name: 'Obsidian Wraith',
    subtitle: 'Matte carbon stealth body with ultraviolet VTOL thrusters',
    price: 300,
    bodyColor: 0x181c26,
    secondaryColor: 0x090b10,
    accentColor: 0xc084fc,
    thrusterColor: 0x9333ea,
    thrusterCoreColor: 0xf0abfc,
    rimColor: 0xa855f7,
    metalness: 0.55,
    roughness: 0.32,
  },
  {
    id: 'solar_gold',
    name: 'Solaris Gold Edition',
    subtitle: 'Brushed champagne-gold metallic hull with cyan-violet propulsion',
    price: 500,
    bodyColor: 0xf59e0b,
    secondaryColor: 0x111827,
    accentColor: 0x38bdf8,
    thrusterColor: 0x4f46e5,
    thrusterCoreColor: 0x7dd3fc,
    rimColor: 0xfbbf24,
    metalness: 0.88,
    roughness: 0.15,
  },
  {
    id: 'hyper_violet',
    name: 'Nebula Violet GT',
    subtitle: 'Deep amethyst pearl finish with twin-stage cyan ion jets',
    price: 750,
    bodyColor: 0x7c3aed,
    secondaryColor: 0x090d16,
    accentColor: 0x22d3ee,
    thrusterColor: 0x06b6d4,
    thrusterCoreColor: 0xe0f2fe,
    rimColor: 0x22d3ee,
    metalness: 0.8,
    roughness: 0.14,
  },
];

export const DEFAULT_MISSIONS: Mission[] = [
  {
    id: 'm_coins_60',
    title: 'Grid Collector',
    description: 'Collect 60 gold coins across your runs',
    type: 'COLLECT_COINS_TOTAL',
    target: 60,
    progress: 0,
    reward: 120,
    completed: false,
    claimed: false,
  },
  {
    id: 'm_dist_800',
    title: 'Highway Cruiser',
    description: 'Travel 800 meters in a single run',
    type: 'SINGLE_RUN_DISTANCE',
    target: 800,
    progress: 0,
    reward: 150,
    completed: false,
    claimed: false,
  },
  {
    id: 'm_flyover_8',
    title: 'Skyline Clearance',
    description: 'Fly directly over 8 road obstacles using VTOL flight mode',
    type: 'FLY_OVER_OBSTACLES',
    target: 8,
    progress: 0,
    reward: 180,
    completed: false,
    claimed: false,
  },
  {
    id: 'm_speed_260',
    title: 'Supersonic Velocity',
    description: 'Reach a top speed of 260 km/h during a run',
    type: 'REACH_SPEED',
    target: 260,
    progress: 0,
    reward: 200,
    completed: false,
    claimed: false,
  },
  {
    id: 'm_orbs_6',
    title: 'Ion Recharger',
    description: 'Collect 6 Flight Energy Orbs to fuel your thrusters',
    type: 'COLLECT_ENERGY_ORBS',
    target: 6,
    progress: 0,
    reward: 160,
    completed: false,
    claimed: false,
  },
];

export const UPGRADE_COSTS: Record<number, number> = {
  1: 100,
  2: 220,
  3: 400,
  4: 650,
};

export function getDefaultSaveData(): SaveData {
  return {
    bestScore: 0,
    bestDistance: 0,
    coins: 100, // Starting bonus coins so player can test upgrades/garage
    unlockedSkins: ['aero_white'],
    selectedSkinId: 'aero_white',
    upgrades: {
      thrusterLevel: 1,
      turboLevel: 1,
      shieldLevel: 1,
      magnetLevel: 1,
    },
    missions: DEFAULT_MISSIONS.map((m) => ({ ...m })),
    settings: {
      musicEnabled: true,
      sfxEnabled: true,
      showTouchButtons: true,
      environmentTheme: EnvironmentTheme.DYNAMIC,
      highQualityGraphics: true,
    },
  };
}

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultSaveData();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const defaults = getDefaultSaveData();

    return {
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : defaults.bestScore,
      bestDistance: typeof parsed.bestDistance === 'number' ? parsed.bestDistance : defaults.bestDistance,
      coins: typeof parsed.coins === 'number' ? parsed.coins : defaults.coins,
      unlockedSkins: Array.isArray(parsed.unlockedSkins) && parsed.unlockedSkins.length > 0
        ? parsed.unlockedSkins
        : defaults.unlockedSkins,
      selectedSkinId: typeof parsed.selectedSkinId === 'string' ? parsed.selectedSkinId : defaults.selectedSkinId,
      upgrades: {
        ...defaults.upgrades,
        ...(parsed.upgrades || {}),
      },
      missions: Array.isArray(parsed.missions) && parsed.missions.length > 0
        ? parsed.missions
        : defaults.missions,
      settings: {
        ...defaults.settings,
        ...(parsed.settings || {}),
      },
    };
  } catch {
    return getDefaultSaveData();
  }
}

export function saveGameData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors in restricted webviews
  }
}
