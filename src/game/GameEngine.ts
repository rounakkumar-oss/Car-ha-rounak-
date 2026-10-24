import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFuturisticFlyingCar, PlayerCarRig } from './CarBuilder';
import { EnvironmentManager, LANE_WIDTH } from './EnvironmentManager';
import { NotificationManager } from './NotificationManager';
import { ActiveObstacle, ObstacleAndCoinManager, ObstacleKind } from './ObstacleAndCoinManager';
import { ParticleSystem } from './ParticleSystem';
import { SoundManager } from './SoundManager';
import { CAR_SKINS, saveGameData } from './storage';
import {
  CarSkin,
  EnvironmentTheme,
  FlightState,
  GameState,
  LiveHudState,
  SaveData,
} from './types';

const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;

  private carRig: PlayerCarRig;
  private envManager: EnvironmentManager;
  private obstacleManager: ObstacleAndCoinManager;
  private particleSystem: ParticleSystem;
  private notifications = new NotificationManager();
  public sound: SoundManager;

  private saveData: SaveData;
  private onHudUpdate: (hud: LiveHudState) => void;
  private onSaveDataUpdate: (save: SaveData) => void;

  // Game Loop & State
  private gameState: GameState = GameState.MENU;
  private flightState: FlightState = FlightState.GROUNDED;
  private lastTime = 0;
  private elapsed = 0;
  private hudSyncTimer = 0;
  private countdownTimer = 0;
  private countdownValue = 3;
  private menuShowcaseFlight = true;

  // Player Physics & Telemetry
  private currentLane = 0;
  private carX = 0;
  private carY = 0;
  private rooftopSupportY = 0;
  private targetAltitude = 0;
  private altitudeTier = 0;
  private baseSpeed = 34;
  private currentSpeed = 34;
  private distance = 0;
  private score = 0;
  private runCoins = 0;
  private skyClears = 0;
  private nearMisses = 0;
  private orbsCollected = 0;
  private flightEnergy = 100;
  private maxFlightEnergy = 100;
  private turboRemaining = 0;
  private shieldRemaining = 0;
  private magnetRemaining = 0;

  // Combo System
  private comboCount = 0;
  private comboMultiplier = 1;
  private comboTimer = 0;

  // Camera Feel & Feedback
  private cameraShake = 0;
  private cameraLookSmooth = new THREE.Vector3(0, 1.0, -12);
  private hitstopTimer = 0;

  // Touch Gesture State
  private touchStartX = 0;
  private touchStartY = 0;
  private gestureConsumed = false;

  constructor(
    container: HTMLElement,
    initialSaveData: SaveData,
    onHudUpdate: (hud: LiveHudState) => void,
    onSaveDataUpdate: (save: SaveData) => void
  ) {
    this.container = container;
    this.saveData = initialSaveData;
    this.onHudUpdate = onHudUpdate;
    this.onSaveDataUpdate = onSaveDataUpdate;

    // 1. Detect Software WebGL
    this.isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // 2. Initialize WebGLRenderer
    const useHighQuality = this.saveData.settings.highQualityGraphics && !this.isSoftwareGl;
    this.renderer = new THREE.WebGLRenderer({
      antialias: useHighQuality,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, useHighQuality ? 2 : 1.25)
    );
    this.renderer.shadowMap.enabled = useHighQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // 3. Initialize Scene & Studio Reflection Environment (RoomEnvironment)
    this.scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 4. Initialize PerspectiveCamera
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 320);
    this.camera.position.set(0, 3.2, 7.6);

    // 5. Initialize Subsystems
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.envManager = new EnvironmentManager(this.scene, maxAniso, this.isSoftwareGl);
    this.obstacleManager = new ObstacleAndCoinManager(this.scene, this.isSoftwareGl);
    this.particleSystem = new ParticleSystem(this.scene);
    this.sound = new SoundManager(
      this.saveData.settings.sfxEnabled,
      this.saveData.settings.musicEnabled
    );

    const initialSkin = this.getSelectedSkin();
    this.carRig = buildFuturisticFlyingCar(initialSkin, this.isSoftwareGl);
    this.scene.add(this.carRig.root);

    this.syncEnvironmentTheme();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHudState();

    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  private getSelectedSkin(): CarSkin {
    return CAR_SKINS.find((s) => s.id === this.saveData.selectedSkinId) || CAR_SKINS[0];
  }

  public updateSaveData(newSave: SaveData): void {
    this.saveData = newSave;
    this.carRig.applySkin(this.getSelectedSkin());
    this.sound.setSettings(newSave.settings.sfxEnabled, newSave.settings.musicEnabled);

    const useHighQuality = newSave.settings.highQualityGraphics && !this.isSoftwareGl;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, useHighQuality ? 2 : 1.25)
    );
    this.syncEnvironmentTheme();
    this.emitHudState();
  }

  public setMenuShowcaseFlight(flying: boolean): void {
    this.menuShowcaseFlight = flying;
  }

  private syncEnvironmentTheme(): void {
    const pref = this.saveData.settings.environmentTheme;
    if (pref === EnvironmentTheme.SUNSET) {
      this.envManager.applyTheme('SUNSET');
    } else if (pref === EnvironmentTheme.NIGHT) {
      this.envManager.applyTheme('NIGHT');
    } else {
      const cycle = Math.floor(this.distance / 650) % 2;
      this.envManager.applyTheme(cycle === 0 ? 'NIGHT' : 'SUNSET');
    }
  }

  // ============================================================================
  // GAME FLOW ACTIONS
  // ============================================================================

  public startRun(): void {
    this.sound.initOnInteraction();
    this.resetRunMetrics();
    this.gameState = GameState.COUNTDOWN;
    this.countdownTimer = 2.25;
    this.countdownValue = 3;
    this.sound.playCountdownBeep(false);
    this.emitHudState();
  }

  public pauseGame(): void {
    if (this.gameState !== GameState.PLAYING) return;
    this.gameState = GameState.PAUSED;
    this.sound.pauseRunAudio();
    this.emitHudState();
  }

  public resumeGame(): void {
    if (this.gameState !== GameState.PAUSED) return;
    this.gameState = GameState.PLAYING;
    this.lastTime = performance.now();
    this.sound.startRunAudio();
    this.emitHudState();
  }

  public restartGame(): void {
    this.startRun();
  }

  public returnToMenu(): void {
    this.sound.pauseRunAudio();
    this.resetRunMetrics();
    this.gameState = GameState.MENU;
    this.emitHudState();
  }

  private resetRunMetrics(): void {
    this.currentLane = 0;
    this.carX = 0;
    this.carY = 0;
    this.rooftopSupportY = 0;
    this.targetAltitude = 0;
    this.altitudeTier = 0;
    this.flightState = FlightState.GROUNDED;

    this.maxFlightEnergy = 100 + (this.saveData.upgrades.thrusterLevel - 1) * 18;
    this.flightEnergy = this.maxFlightEnergy;

    this.baseSpeed = 34;
    this.currentSpeed = 34;
    this.distance = 0;
    this.score = 0;
    this.runCoins = 0;
    this.skyClears = 0;
    this.nearMisses = 0;
    this.orbsCollected = 0;
    this.turboRemaining = 0;
    this.shieldRemaining = 0;
    this.magnetRemaining = 0;

    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;

    this.cameraShake = 0;
    this.hitstopTimer = 0;
    this.notifications.clear();

    this.carRig.root.position.set(0, 0, 0);
    this.carRig.chassisGroup.position.set(0, 0, 0);
    this.carRig.chassisGroup.rotation.set(0, 0, 0);

    this.envManager.reset();
    this.obstacleManager.reset();
    this.particleSystem.reset();
    this.syncEnvironmentTheme();
  }

  // ============================================================================
  // PLAYER CONTROLS
  // ============================================================================

  public moveLeft(): void {
    if (this.gameState !== GameState.PLAYING && this.gameState !== GameState.COUNTDOWN) return;
    if (this.currentLane > -1) {
      this.currentLane -= 1;
      this.sound.playLaneSwitch();
    }
  }

  public moveRight(): void {
    if (this.gameState !== GameState.PLAYING && this.gameState !== GameState.COUNTDOWN) return;
    if (this.currentLane < 1) {
      this.currentLane += 1;
      this.sound.playLaneSwitch();
    }
  }

  public triggerFlyUp(): void {
    if (this.gameState === GameState.MENU) {
      this.menuShowcaseFlight = true;
      this.sound.playTakeoff();
      return;
    }
    if (this.gameState !== GameState.PLAYING) return;

    if (
      this.flightState === FlightState.GROUNDED ||
      this.flightState === FlightState.DESCENDING
    ) {
      if (this.flightEnergy >= 15) {
        this.flightState = FlightState.TAKING_OFF;
        this.altitudeTier = 1;
        this.targetAltitude = 2.65;
        this.sound.playTakeoff();
        this.cameraShake = 0.16;
        this.notifications.notifyEvent('FLIGHT', 'VTOL FLIGHT', undefined, 'purple', 0, 950, 2);
        this.particleSystem.emitTakeoffShockwave(this.carX, 0);
      } else {
        this.notifications.notifyEvent('FLIGHT', 'LOW ENERGY', undefined, 'purple', 0, 900, 2);
      }
    } else if (this.altitudeTier === 1 && this.flightEnergy >= 20) {
      this.altitudeTier = 2;
      this.targetAltitude = 4.25;
      this.flightState = FlightState.TAKING_OFF;
      this.sound.playTakeoff();
      this.cameraShake = 0.14;
      this.notifications.notifyEvent('FLIGHT', 'HIGH ALTITUDE', undefined, 'purple', 0, 950, 2);
    }
  }

  public triggerDescend(): void {
    if (this.gameState === GameState.MENU) {
      this.menuShowcaseFlight = false;
      this.sound.playLanding();
      return;
    }
    if (this.gameState !== GameState.PLAYING) return;

    if (this.flightState !== FlightState.GROUNDED) {
      this.flightState = FlightState.DESCENDING;
      this.altitudeTier = 0;
      this.targetAltitude = this.rooftopSupportY;
      this.sound.playLanding();
    }
  }

  public toggleFlight(): void {
    if (this.gameState === GameState.MENU) {
      this.menuShowcaseFlight = !this.menuShowcaseFlight;
      if (this.menuShowcaseFlight) {
        this.sound.playTakeoff();
      } else {
        this.sound.playLanding();
      }
      return;
    }
    if (this.gameState !== GameState.PLAYING) return;

    if (
      this.flightState === FlightState.GROUNDED ||
      this.flightState === FlightState.DESCENDING
    ) {
      this.triggerFlyUp();
    } else {
      this.triggerDescend();
    }
  }

  public triggerManualTurbo(): void {
    if (this.gameState !== GameState.PLAYING) return;
    if (this.turboRemaining <= 0 && this.flightEnergy >= 40) {
      this.flightEnergy = Math.max(0, this.flightEnergy - 30);
      const turboDuration = 4.5 + (this.saveData.upgrades.turboLevel - 1) * 0.9;
      this.turboRemaining = turboDuration;
      this.sound.playBoost();
      this.cameraShake = 0.28;
      this.notifications.notifyEvent('POWERUP', 'OVERDRIVE TURBO', '2X SCORE', 'cyan', 0, 1050, 3);
    }
  }

  // ============================================================================
  // MAIN SIMULATION LOOP & SOFTWARE WEBGL PACING
  // ============================================================================

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (document.hidden) {
      if (this.gameState === GameState.PLAYING) {
        this.pauseGame();
      }
      this.scheduleNextFrame();
      return;
    }

    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsed += dt;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.renderer.render(this.scene, this.camera);
      this.scheduleNextFrame();
      return;
    }

    this.updateScene(dt);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  private updateScene(dt: number): void {
    const skin = this.getSelectedSkin();

    // 1. MENU SHOWCASE STATE
    if (this.gameState === GameState.MENU) {
      const showcaseSpeed = 28;
      this.envManager.update(dt, showcaseSpeed);

      const targetMenuY = this.menuShowcaseFlight ? 1.75 : 0;
      this.carY = THREE.MathUtils.damp(this.carY, targetMenuY, 5.5, dt);
      const showcaseState = this.carY > 0.2 ? FlightState.FLYING : FlightState.GROUNDED;

      this.carRig.root.position.x = 0;
      this.carRig.updateAnimation(
        dt,
        this.elapsed,
        showcaseSpeed,
        showcaseState,
        this.carY,
        Math.sin(this.elapsed * 1.3) * 0.9,
        false,
        false,
        false
      );

      if (this.carY > 0.25) {
        this.particleSystem.emitThrusterMist(0, this.carY, 0, skin.thrusterColor, false);
      }
      this.particleSystem.update(dt, showcaseSpeed, false);

      const camAngle = Math.sin(this.elapsed * 0.42) * 0.62;
      _camTargetPos.set(
        Math.sin(camAngle) * 4.8,
        1.75 + this.carY * 0.48,
        5.3 + Math.cos(camAngle) * 0.75
      );
      this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-6 * dt));
      _camLookAt.set(0, 0.55 + this.carY * 0.6, -0.8);
      this.camera.lookAt(_camLookAt);
      this.camera.rotation.z = 0;
      return;
    }

    // 2. COUNTDOWN STATE
    if (this.gameState === GameState.COUNTDOWN) {
      const prevCount = this.countdownValue;
      this.countdownTimer -= dt;
      this.countdownValue = Math.max(0, Math.ceil(this.countdownTimer / 0.75));

      if (this.countdownValue !== prevCount && this.countdownValue > 0) {
        this.sound.playCountdownBeep(false);
        this.emitHudState();
      }

      const desiredX = this.currentLane * LANE_WIDTH;
      const prevX = this.carX;
      this.carX = THREE.MathUtils.damp(this.carX, desiredX, 13, dt);
      const steerVel = (this.carX - prevX) / dt;
      this.carRig.root.position.x = this.carX;

      this.envManager.update(dt, 16);
      this.particleSystem.update(dt, 16, false);
      this.carRig.updateAnimation(
        dt,
        this.elapsed,
        16,
        FlightState.GROUNDED,
        0,
        steerVel,
        false,
        false,
        false
      );
      this.updateChaseCamera(dt, 0, false);

      if (this.countdownTimer <= 0) {
        this.gameState = GameState.PLAYING;
        this.sound.playCountdownBeep(true);
        this.sound.startRunAudio();
        this.emitHudState();
      }
      return;
    }

    // 3. PAUSED OR GAME_OVER STATE
    if (this.gameState === GameState.PAUSED || this.gameState === GameState.GAME_OVER) {
      this.particleSystem.update(dt, 0, false);
      this.updateChaseCamera(dt, 0, false);
      return;
    }

    // 4. PLAYING STATE
    const hadNotif = this.notifications.getActiveNotification() !== null;
    const hadFeedback = this.notifications.getScoreFeedback() !== null;
    this.notifications.update(dt);
    const hasNotifNow = this.notifications.getActiveNotification() !== null;
    const hasFeedbackNow = this.notifications.getScoreFeedback() !== null;

    // Update Coin Combo Timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboMultiplier = 1;
      }
    }

    // Progressive Difficulty & Speed Ramp
    const difficultyRatio = Math.min(this.distance / 2600, 1.0);
    this.baseSpeed = 35 + difficultyRatio * 28;

    // Powerup Timers
    if (this.turboRemaining > 0) {
      this.turboRemaining = Math.max(0, this.turboRemaining - dt);
    }
    if (this.shieldRemaining > 0) {
      this.shieldRemaining = Math.max(0, this.shieldRemaining - dt);
    }
    if (this.magnetRemaining > 0) {
      this.magnetRemaining = Math.max(0, this.magnetRemaining - dt);
    }

    const isTurbo = this.turboRemaining > 0;
    const hasShield = this.shieldRemaining > 0;
    const hasMagnet = this.magnetRemaining > 0;

    const turboMultiplier = isTurbo
      ? 1.44 + (this.saveData.upgrades.turboLevel - 1) * 0.05
      : 1.0;
    const targetSpeed = this.baseSpeed * turboMultiplier;
    this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, targetSpeed, 5.5, dt);

    // Advance Distance & Score
    const frameDist = this.currentSpeed * dt;
    this.distance += frameDist;
    this.score += frameDist * (isTurbo ? 3.5 : 1.75);

    if (this.saveData.settings.environmentTheme === EnvironmentTheme.DYNAMIC) {
      this.syncEnvironmentTheme();
    }

    // Smooth 3-Lane Horizontal Interpolation
    const targetX = this.currentLane * LANE_WIDTH;
    const prevX = this.carX;
    this.carX = THREE.MathUtils.damp(this.carX, targetX, 13.5, dt);
    const steerVelocity = (this.carX - prevX) / dt;
    this.carRig.root.position.x = this.carX;

    // True Flight-State Machine & Balanced Energy Management (2.5x faster drain while flying)
    const drainRate = Math.max(
      20.0,
      (14.0 - (this.saveData.upgrades.thrusterLevel - 1) * 1.3) * 2.5
    );
    const rechargeRate = 7.5 + (this.saveData.upgrades.thrusterLevel - 1) * 1.5;

    if (this.flightState === FlightState.TAKING_OFF || this.flightState === FlightState.FLYING) {
      this.flightEnergy -= (isTurbo ? drainRate * 0.65 : drainRate) * dt;

      const effectiveTargetY = Math.max(this.targetAltitude, this.rooftopSupportY + 0.55);
      this.carY = THREE.MathUtils.damp(this.carY, effectiveTargetY, 8.5, dt);
      if (
        this.flightState === FlightState.TAKING_OFF &&
        Math.abs(this.carY - effectiveTargetY) < 0.22
      ) {
        this.flightState = FlightState.FLYING;
      }

      this.particleSystem.emitThrusterMist(
        this.carX,
        this.carY,
        0,
        skin.thrusterColor,
        isTurbo
      );

      if (this.flightEnergy <= 0) {
        this.flightEnergy = 0;
        this.flightState = FlightState.DESCENDING;
        this.altitudeTier = 0;
        this.targetAltitude = this.rooftopSupportY;
        this.sound.playLanding();
        this.notifications.notifyEvent('FLIGHT', 'AUTO LANDING', undefined, 'purple', 0, 950, 2);
      }
    } else if (this.flightState === FlightState.DESCENDING) {
      this.carY = THREE.MathUtils.damp(this.carY, this.rooftopSupportY, 11.5, dt);
      if (this.carY <= this.rooftopSupportY + 0.06) {
        this.carY = this.rooftopSupportY;
        this.flightState = FlightState.GROUNDED;
        this.altitudeTier = 0;
        this.cameraShake = Math.max(this.cameraShake, 0.16);
        this.carRig.triggerLandingBounce();
        this.particleSystem.emitLandingDust(this.carX, this.rooftopSupportY);
      }
    } else {
      // GROUNDED (either on the highway or riding atop a parked bus/truck roof!)
      this.carY = THREE.MathUtils.damp(this.carY, this.rooftopSupportY, 14.0, dt);
      this.flightEnergy = Math.min(this.maxFlightEnergy, this.flightEnergy + rechargeRate * dt);
    }

    if (isTurbo) {
      this.particleSystem.emitTurboExhaust(this.carX, this.carY, 0);
    }

    this.carRig.updateAnimation(
      dt,
      this.elapsed,
      this.currentSpeed,
      this.flightState,
      this.carY,
      steerVelocity,
      isTurbo,
      hasShield,
      hasMagnet
    );
    this.envManager.update(dt, this.currentSpeed);
    this.particleSystem.update(dt, this.currentSpeed, isTurbo);

    const speedKmh = Math.round(this.currentSpeed * 3.6);
    this.sound.updateEngineSound(
      speedKmh,
      this.flightState !== FlightState.GROUNDED,
      isTurbo
    );

    const baseMagnet = 1.7 + (this.saveData.upgrades.magnetLevel - 1) * 1.25;
    const magnetRadius = hasMagnet ? 11.5 : baseMagnet;

    this.rooftopSupportY = this.obstacleManager.update(
      dt,
      this.elapsed,
      this.currentSpeed,
      difficultyRatio,
      this.carX,
      this.carY,
      magnetRadius,
      {
        onCoinCollected: (x, y, z) => {
          this.runCoins += 1;
          this.saveData.coins += 1;

          this.comboCount += 1;
          this.comboTimer = 1.85;
          this.comboMultiplier = Math.min(5, 1 + Math.floor(this.comboCount / 4));

          const coinPoints = 20 * this.comboMultiplier;
          this.score += coinPoints;

          this.sound.playCoin(this.comboMultiplier);
          this.particleSystem.emitBurst(x, y, z, 0xfbbf24, 11, 5.5, 0.9);

          this.notifications.notifyCoinAndCombo(
            coinPoints,
            this.comboMultiplier,
            this.comboCount
          );

          this.incrementMissionProgress('COLLECT_COINS_TOTAL', 1);
          this.emitHudState();
        },
        onEnergyOrbCollected: (x, y, z) => {
          this.orbsCollected += 1;
          // Restores 25% flight energy so flying remains a tactical escape
          this.flightEnergy = Math.min(
            this.maxFlightEnergy,
            this.flightEnergy + this.maxFlightEnergy * 0.25
          );
          this.score += 50;
          this.sound.playEnergyOrb();
          this.particleSystem.emitBurst(x, y, z, 0xa855f7, 16, 6.5, 1.15);
          this.notifications.notifyEvent(
            'FLIGHT',
            'FLIGHT ENERGY +25%',
            '+50 PTS',
            'purple',
            50,
            1000,
            3
          );
          this.incrementMissionProgress('COLLECT_ENERGY_ORBS', 1);
          this.emitHudState();
        },
        onTurboCollected: (x, y, z) => {
          const duration = 5.5 + (this.saveData.upgrades.turboLevel - 1) * 1.1;
          this.turboRemaining = duration;
          this.score += 80;
          this.sound.playBoost();
          this.cameraShake = 0.3;
          this.particleSystem.emitBurst(x, y, z, 0x06b6d4, 20, 8.0, 1.25);
          this.notifications.notifyEvent(
            'POWERUP',
            'TURBO BOOST',
            '+80 PTS',
            'cyan',
            80,
            1050,
            3
          );
          this.emitHudState();
        },
        onShieldCollected: (x, y, z) => {
          const duration = 11.0 + (this.saveData.upgrades.shieldLevel - 1) * 2.5;
          this.shieldRemaining = duration;
          this.score += 65;
          this.sound.playEnergyOrb();
          this.particleSystem.emitBurst(x, y, z, 0x10b981, 16, 6.5, 1.15);
          this.notifications.notifyEvent(
            'POWERUP',
            'SHIELD ACTIVE',
            '+65 PTS',
            'emerald',
            65,
            1050,
            3
          );
          this.emitHudState();
        },
        onMagnetCollected: (x, y, z) => {
          const duration = 10.0 + (this.saveData.upgrades.magnetLevel - 1) * 2.0;
          this.magnetRemaining = duration;
          this.score += 65;
          this.sound.playEnergyOrb();
          this.particleSystem.emitBurst(x, y, z, 0xf59e0b, 18, 7.0, 1.2);
          this.notifications.notifyEvent(
            'POWERUP',
            'COIN MAGNET',
            '+65 PTS',
            'gold',
            65,
            1050,
            3
          );
          this.emitHudState();
        },
        onSkyClear: (_kind: ObstacleKind) => {
          this.skyClears += 1;
          const pts = 45 * this.comboMultiplier;
          this.score += pts;
          this.notifications.notifyEvent(
            'FLIGHT',
            'SKY CLEAR',
            `+${pts} PTS`,
            'purple',
            pts,
            1050,
            3
          );
          this.incrementMissionProgress('FLY_OVER_OBSTACLES', 1);
          this.emitHudState();
        },
        onNearMiss: (_kind: ObstacleKind, x: number, z: number) => {
          this.nearMisses += 1;
          const pts = 60 * this.comboMultiplier;
          this.score += pts;
          this.flightEnergy = Math.min(
            this.maxFlightEnergy,
            this.flightEnergy + this.maxFlightEnergy * 0.06
          );
          this.sound.playNearMiss();
          this.cameraShake = Math.max(this.cameraShake, 0.09);
          this.particleSystem.emitBurst(x, this.carY + 0.5, z, 0x38bdf8, 8, 4.5, 0.8);
          this.notifications.notifyEvent(
            'NEAR_MISS',
            'NEAR MISS',
            `+${pts} PTS`,
            'cyan',
            pts,
            1050,
            3
          );
          this.emitHudState();
        },
        onObstacleHit: (obs: ActiveObstacle) => {
          if (this.shieldRemaining > 0) {
            this.shieldRemaining = 0;
            this.sound.playShieldBreak();
            this.cameraShake = 0.45;
            this.hitstopTimer = 0.045;
            this.score += 75;
            this.particleSystem.emitBurst(obs.x, this.carY + 0.6, 0, 0x22d3ee, 28, 9, 1.4);
            this.notifications.notifyEvent(
              'POWERUP',
              'SHIELD IMPACT',
              '+75 PTS',
              'emerald',
              75,
              1050,
              3
            );
            this.emitHudState();
          } else {
            this.triggerGameOver(obs);
          }
        },
      }
    );

    this.updateRunMissions(Math.floor(this.distance), speedKmh);
    this.updateChaseCamera(dt, steerVelocity, isTurbo);

    this.hudSyncTimer += dt;
    if (
      this.hudSyncTimer >= 0.06 ||
      hadNotif !== hasNotifNow ||
      hadFeedback !== hasFeedbackNow
    ) {
      this.hudSyncTimer = 0;
      this.emitHudState();
    }
  }

  private triggerGameOver(obs: ActiveObstacle): void {
    this.gameState = GameState.GAME_OVER;
    this.notifications.clear();
    this.sound.pauseRunAudio();
    this.sound.playCollision();
    this.cameraShake = 0.68;
    this.hitstopTimer = 0.065;
    this.particleSystem.emitBurst(obs.x, this.carY + 0.6, 0, 0xff1744, 36, 10.5, 1.5);

    const finalScore = Math.floor(this.score);
    const finalDist = Math.floor(this.distance);

    if (finalScore > this.saveData.bestScore) {
      this.saveData.bestScore = finalScore;
    }
    if (finalDist > this.saveData.bestDistance) {
      this.saveData.bestDistance = finalDist;
    }

    saveGameData(this.saveData);
    this.onSaveDataUpdate({ ...this.saveData });
    this.emitHudState();
  }

  private incrementMissionProgress(type: string, delta: number): void {
    let changed = false;
    this.saveData.missions.forEach((m) => {
      if (m.type === type && !m.completed) {
        m.progress = Math.min(m.target, m.progress + delta);
        if (m.progress >= m.target) {
          m.completed = true;
          this.notifications.notifyEvent(
            'SYSTEM',
            `MISSION: ${m.title}`,
            `+${m.reward} COINS`,
            'gold',
            0,
            1150,
            3
          );
        }
        changed = true;
      }
    });
    if (changed) {
      saveGameData(this.saveData);
      this.onSaveDataUpdate({ ...this.saveData });
    }
  }

  private updateRunMissions(distMeters: number, speedKmh: number): void {
    let changed = false;
    this.saveData.missions.forEach((m) => {
      if (m.completed) return;
      if (m.type === 'SINGLE_RUN_DISTANCE' && distMeters > m.progress) {
        m.progress = Math.min(m.target, distMeters);
        if (m.progress >= m.target) {
          m.completed = true;
          this.notifications.notifyEvent(
            'SYSTEM',
            `MISSION: ${m.title}`,
            `+${m.reward} COINS`,
            'gold',
            0,
            1150,
            3
          );
        }
        changed = true;
      } else if (m.type === 'REACH_SPEED' && speedKmh > m.progress) {
        m.progress = Math.min(m.target, speedKmh);
        if (m.progress >= m.target) {
          m.completed = true;
          this.notifications.notifyEvent(
            'SYSTEM',
            `MISSION: ${m.title}`,
            `+${m.reward} COINS`,
            'gold',
            0,
            1150,
            3
          );
        }
        changed = true;
      }
    });
    if (changed) {
      saveGameData(this.saveData);
      this.onSaveDataUpdate({ ...this.saveData });
    }
  }

  private updateChaseCamera(dt: number, steerVelocity: number, isTurbo: boolean): void {
    const aspect = this.camera.aspect;
    const isPortrait = aspect < 1.0;

    const speedFactor = THREE.MathUtils.clamp((this.currentSpeed - 32) / 38, 0, 1.2);
    const baseZ = (isPortrait ? 8.1 : 6.4) + speedFactor * 0.65 + (isTurbo ? 0.55 : 0);
    const baseY = (isPortrait ? 3.45 : 2.75) + this.carY * 0.62;

    const desiredFov =
      (isPortrait ? 66 : 58) + speedFactor * 5.5 + (isTurbo ? 9.5 : 0);
    if (Math.abs(this.camera.fov - desiredFov) > 0.08) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, desiredFov, 6.5, dt);
      this.camera.updateProjectionMatrix();
    }

    let shakeX = 0;
    let shakeY = 0;
    const roadBuzz =
      this.flightState === FlightState.GROUNDED
        ? speedFactor * 0.014 + (isTurbo ? 0.022 : 0)
        : 0.006;

    shakeX += Math.sin(this.elapsed * 47) * roadBuzz;
    shakeY += Math.cos(this.elapsed * 53) * roadBuzz;

    if (this.cameraShake > 0.004) {
      this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 7.5, dt);
      shakeX += (Math.random() - 0.5) * this.cameraShake;
      shakeY += (Math.random() - 0.5) * this.cameraShake;
    } else {
      this.cameraShake = 0;
    }

    _camTargetPos.set(this.carX * 0.66 + shakeX, baseY + shakeY, baseZ);
    this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-10.5 * dt));

    _camLookAt.set(this.carX * 0.42, 0.72 + this.carY * 0.54, -13.5);
    this.cameraLookSmooth.lerp(_camLookAt, 1 - Math.exp(-12 * dt));
    this.camera.lookAt(this.cameraLookSmooth);

    const targetCamRoll = THREE.MathUtils.clamp(-steerVelocity * 0.0032, -0.045, 0.045);
    this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, targetCamRoll, 9, dt);
  }

  private emitHudState(): void {
    this.onHudUpdate({
      gameState: this.gameState,
      flightState: this.flightState,
      countdownValue: this.countdownValue,
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      runCoins: this.runCoins,
      totalCoins: this.saveData.coins,
      speedKmh: Math.round(this.currentSpeed * 3.6),
      flightEnergy: Math.round(this.flightEnergy),
      maxFlightEnergy: this.maxFlightEnergy,
      altitudeMeters: Number((this.carY * 1.8).toFixed(1)),
      altitudeTier: this.altitudeTier,
      turboRemaining: Number(this.turboRemaining.toFixed(1)),
      shieldRemaining: Number(this.shieldRemaining.toFixed(1)),
      magnetRemaining: Number(this.magnetRemaining.toFixed(1)),
      hasShield: this.shieldRemaining > 0,
      comboMultiplier: this.comboMultiplier,
      comboCount: this.comboCount,
      nearMisses: this.nearMisses,
      skyClears: this.skyClears,
      orbsCollected: this.orbsCollected,
      notification: this.notifications.getActiveNotification(),
      scoreFeedback: this.notifications.getScoreFeedback(),
      activeTheme: this.envManager.getActiveTheme(),
    });
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;

    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (this.gameState === GameState.PLAYING) {
        this.pauseGame();
      } else if (this.gameState === GameState.PAUSED) {
        this.resumeGame();
      }
      return;
    }

    if (this.gameState === GameState.MENU && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.startRun();
      return;
    }

    if (this.gameState !== GameState.PLAYING && this.gameState !== GameState.COUNTDOWN) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        this.moveLeft();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        this.moveRight();
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        this.triggerFlyUp();
        break;
      case ' ':
        e.preventDefault();
        this.toggleFlight();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        this.triggerDescend();
        break;
      case 'Shift':
      case 'e':
      case 'E':
        e.preventDefault();
        this.triggerManualTurbo();
        break;
    }
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 0) return;
    this.sound.initOnInteraction();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
    this.gestureConsumed = false;
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (this.gameState === GameState.PLAYING || this.gameState === GameState.COUNTDOWN) {
      e.preventDefault();
    }
    if (this.gestureConsumed || e.touches.length === 0) return;

    const dx = e.touches[0].clientX - this.touchStartX;
    const dy = e.touches[0].clientY - this.touchStartY;
    const threshold = 26;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    this.gestureConsumed = true;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        this.moveLeft();
      } else {
        this.moveRight();
      }
    } else {
      if (dy < 0) {
        this.triggerFlyUp();
      } else {
        this.triggerDescend();
      }
    }
  };

  private handleTouchEnd = (): void => {
    this.gestureConsumed = false;
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    if (this.gameState === GameState.PLAYING) {
      this.pauseGame();
    }
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);

    const dom = this.renderer.domElement;
    dom.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    dom.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    dom.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    dom.addEventListener('webglcontextlost', this.handleContextLost, false);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.notifications.clear();

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);

    const dom = this.renderer.domElement;
    dom.removeEventListener('touchstart', this.handleTouchStart);
    dom.removeEventListener('touchmove', this.handleTouchMove);
    dom.removeEventListener('touchend', this.handleTouchEnd);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);

    this.sound.dispose();
    this.renderer.dispose();
  }
}
