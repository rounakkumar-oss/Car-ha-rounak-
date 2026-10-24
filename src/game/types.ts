import { ActiveGameplayNotification, HudScoreFeedback } from './NotificationManager';

export enum GameState {
  MENU = 'MENU',
  COUNTDOWN = 'COUNTDOWN',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

export enum FlightState {
  GROUNDED = 'GROUNDED',
  TAKING_OFF = 'TAKING_OFF',
  FLYING = 'FLYING',
  DESCENDING = 'DESCENDING',
}

export enum EnvironmentTheme {
  SUNSET = 'SUNSET',
  NIGHT = 'NIGHT',
  DYNAMIC = 'DYNAMIC',
}

export interface CarSkin {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  bodyColor: number;
  secondaryColor: number;
  accentColor: number;
  thrusterColor: number;
  thrusterCoreColor: number;
  rimColor: number;
  metalness: number;
  roughness: number;
}

export interface CarUpgrades {
  thrusterLevel: number;
  turboLevel: number;
  shieldLevel: number;
  magnetLevel: number;
}

export type MissionType =
  | 'COLLECT_COINS_TOTAL'
  | 'SINGLE_RUN_DISTANCE'
  | 'FLY_OVER_OBSTACLES'
  | 'REACH_SPEED'
  | 'COLLECT_ENERGY_ORBS';

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: MissionType;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
}

export interface GameSettings {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  showTouchButtons: boolean;
  environmentTheme: EnvironmentTheme;
  highQualityGraphics: boolean;
}

export interface SaveData {
  bestScore: number;
  bestDistance: number;
  coins: number;
  unlockedSkins: string[];
  selectedSkinId: string;
  upgrades: CarUpgrades;
  missions: Mission[];
  settings: GameSettings;
}

export interface LiveHudState {
  gameState: GameState;
  flightState: FlightState;
  countdownValue: number;
  score: number;
  distance: number;
  runCoins: number;
  totalCoins: number;
  speedKmh: number;
  flightEnergy: number;
  maxFlightEnergy: number;
  altitudeMeters: number;
  altitudeTier: number;
  turboRemaining: number;
  shieldRemaining: number;
  magnetRemaining: number;
  hasShield: boolean;
  comboMultiplier: number;
  comboCount: number;
  nearMisses: number;
  skyClears: number;
  orbsCollected: number;
  notification: ActiveGameplayNotification | null;
  scoreFeedback: HudScoreFeedback | null;
  activeTheme: 'SUNSET' | 'NIGHT';
}
