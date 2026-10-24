import * as THREE from 'three';
import { LANE_WIDTH } from './EnvironmentManager';

export type ObstacleKind =
  | 'CYBER_SEDAN'
  | 'CARGO_VAN'
  | 'HOVER_TRUCK'
  | 'PARKED_BUS'
  | 'PARKED_HEAVY_TRUCK'
  | 'PARKED_RAMP_TRUCK';

export type CollectibleKind = 'COIN' | 'ENERGY_ORB' | 'TURBO' | 'SHIELD' | 'MAGNET';

export interface ActiveObstacle {
  active: boolean;
  kind: ObstacleKind;
  lane: number; // -1, 0, 1
  x: number;
  z: number;
  minY: number;
  maxY: number;
  halfW: number;
  halfD: number;
  ownSpeed: number;
  baseOwnSpeed: number;
  isRooftop: boolean;
  hasRamp: boolean;
  passedPlayer: boolean;
  playerWasCloseInLane: boolean;
  mesh: THREE.Group;
}

export interface ActiveCollectible {
  active: boolean;
  kind: CollectibleKind;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Group;
}

export interface CollisionCallbacks {
  onCoinCollected: (x: number, y: number, z: number) => void;
  onEnergyOrbCollected: (x: number, y: number, z: number) => void;
  onTurboCollected: (x: number, y: number, z: number) => void;
  onShieldCollected: (x: number, y: number, z: number) => void;
  onMagnetCollected: (x: number, y: number, z: number) => void;
  onSkyClear: (kind: ObstacleKind) => void;
  onNearMiss: (kind: ObstacleKind, x: number, z: number) => void;
  onObstacleHit: (obs: ActiveObstacle) => void;
}

export class ObstacleAndCoinManager {
  private root = new THREE.Group();
  private obstacles: ActiveObstacle[] = [];
  private collectibles: ActiveCollectible[] = [];
  private spawnTimer = 0;
  private waveCounter = 0;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    scene.add(this.root);
    this.initPools(isSoftwareGl);
  }

  private initPools(isSoftwareGl: boolean): void {
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.75,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x090d16,
      roughness: 0.08,
      metalness: 0.2,
      clearcoat: 1.0,
    });
    const redGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff1744,
      emissiveIntensity: 2.6,
      roughness: 0.15,
    });
    const amberGlowMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.4,
      roughness: 0.18,
    });
    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.4,
      roughness: 0.18,
    });
    const purpleGlowMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0xa855f7,
      emissiveIntensity: 2.5,
      roughness: 0.18,
    });

    // Varied vehicle paint palette so traffic never looks identical
    const sedanColors = [0xdc2626, 0x2563eb, 0x94a3b8, 0x10b981];
    const vanColors = [0xd97706, 0xe2e8f0, 0x0d9488, 0x6366f1];
    const hoverTruckColors = [0x334155, 0x7c3aed, 0x0284c7, 0x475569];
    const busColors = [0x1d4ed8, 0xb45309, 0x0f766e];
    const heavyTruckColors = [0x1e293b, 0x374151, 0x312e81];

    const poolRecipe: ObstacleKind[] = [
      'CYBER_SEDAN',
      'CYBER_SEDAN',
      'CYBER_SEDAN',
      'CYBER_SEDAN',
      'CYBER_SEDAN',
      'CYBER_SEDAN',
      'CARGO_VAN',
      'CARGO_VAN',
      'CARGO_VAN',
      'CARGO_VAN',
      'CARGO_VAN',
      'HOVER_TRUCK',
      'HOVER_TRUCK',
      'HOVER_TRUCK',
      'HOVER_TRUCK',
      'HOVER_TRUCK',
      'PARKED_BUS',
      'PARKED_BUS',
      'PARKED_BUS',
      'PARKED_BUS',
      'PARKED_BUS',
      'PARKED_HEAVY_TRUCK',
      'PARKED_HEAVY_TRUCK',
      'PARKED_HEAVY_TRUCK',
      'PARKED_HEAVY_TRUCK',
      'PARKED_RAMP_TRUCK',
      'PARKED_RAMP_TRUCK',
      'PARKED_RAMP_TRUCK',
      'PARKED_RAMP_TRUCK',
    ];

    poolRecipe.forEach((kind, i) => {
      let colorHex = 0x334155;
      if (kind === 'CYBER_SEDAN') colorHex = sedanColors[i % sedanColors.length];
      else if (kind === 'CARGO_VAN') colorHex = vanColors[i % vanColors.length];
      else if (kind === 'HOVER_TRUCK') colorHex = hoverTruckColors[i % hoverTruckColors.length];
      else if (kind === 'PARKED_BUS') colorHex = busColors[i % busColors.length];
      else colorHex = heavyTruckColors[i % heavyTruckColors.length];

      const paintMat = new THREE.MeshPhysicalMaterial({
        color: colorHex,
        roughness: 0.24,
        metalness: 0.62,
        clearcoat: 0.85,
      });

      const mesh = this.createObstacleMesh(
        kind,
        paintMat,
        darkMetalMat,
        glassMat,
        redGlowMat,
        amberGlowMat,
        cyanGlowMat,
        purpleGlowMat,
        isSoftwareGl
      );
      mesh.visible = false;
      this.root.add(mesh);

      const bounds = this.getObstacleBounds(kind);
      this.obstacles.push({
        active: false,
        kind,
        lane: 0,
        x: 0,
        z: -500,
        minY: bounds.minY,
        maxY: bounds.maxY,
        halfW: bounds.halfW,
        halfD: bounds.halfD,
        ownSpeed: bounds.ownSpeed,
        baseOwnSpeed: bounds.ownSpeed,
        isRooftop: bounds.isRooftop,
        hasRamp: bounds.hasRamp,
        passedPlayer: false,
        playerWasCloseInLane: false,
        mesh,
      });
    });

    // Pool of 76 Collectibles (58 Coins, 5 Energy Orbs, 5 Turbos, 4 Shields, 4 Magnets)
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.95,
      metalness: 0.9,
      roughness: 0.14,
    });
    const coinCoreMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.5,
      metalness: 0.6,
      roughness: 0.18,
    });
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 2.2,
      metalness: 0.4,
      roughness: 0.15,
    });

    const coinOuterGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 16);
    coinOuterGeo.rotateZ(Math.PI / 2);
    coinOuterGeo.rotateY(Math.PI / 2);
    const coinInnerGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.15, 8);
    coinInnerGeo.rotateZ(Math.PI / 2);
    coinInnerGeo.rotateY(Math.PI / 2);

    const orbSphereGeo = new THREE.OctahedronGeometry(0.44, 1);
    const orbRingGeo = new THREE.TorusGeometry(0.62, 0.055, 8, 24);
    const turboCoreGeo = new THREE.OctahedronGeometry(0.48, 0);
    const shieldCoreGeo = new THREE.IcosahedronGeometry(0.48, 0);
    const magnetArchGeo = new THREE.TorusGeometry(0.42, 0.12, 10, 20, Math.PI * 1.35);

    for (let i = 0; i < 76; i++) {
      let kind: CollectibleKind = 'COIN';
      if (i >= 58 && i < 63) kind = 'ENERGY_ORB';
      else if (i >= 63 && i < 68) kind = 'TURBO';
      else if (i >= 68 && i < 72) kind = 'SHIELD';
      else if (i >= 72) kind = 'MAGNET';

      const group = new THREE.Group();
      if (kind === 'COIN') {
        const outer = new THREE.Mesh(coinOuterGeo, coinMat);
        const inner = new THREE.Mesh(coinInnerGeo, coinCoreMat);
        group.add(outer, inner);
      } else if (kind === 'ENERGY_ORB') {
        const core = new THREE.Mesh(orbSphereGeo, purpleGlowMat);
        const ring = new THREE.Mesh(orbRingGeo, cyanGlowMat);
        group.add(core, ring);
      } else if (kind === 'TURBO') {
        const core = new THREE.Mesh(turboCoreGeo, cyanGlowMat);
        core.scale.set(0.9, 1.35, 0.9);
        const ring = new THREE.Mesh(orbRingGeo, amberGlowMat);
        ring.rotation.x = Math.PI / 3;
        group.add(core, ring);
      } else if (kind === 'SHIELD') {
        const core = new THREE.Mesh(shieldCoreGeo, shieldMat);
        const ring = new THREE.Mesh(orbRingGeo, cyanGlowMat);
        group.add(core, ring);
      } else {
        const arch = new THREE.Mesh(magnetArchGeo, amberGlowMat);
        const ring = new THREE.Mesh(orbRingGeo, purpleGlowMat);
        ring.rotation.y = Math.PI / 2;
        group.add(arch, ring);
      }

      group.visible = false;
      this.root.add(group);
      this.collectibles.push({
        active: false,
        kind,
        x: 0,
        y: 0.85,
        z: -500,
        mesh: group,
      });
    }
  }

  /**
   * Tightened collision bounding boxes (~20% slimmer/shorter than visual outer shells)
   * to prevent premature or unfair corner collisions.
   */
  private getObstacleBounds(kind: ObstacleKind) {
    switch (kind) {
      case 'CYBER_SEDAN':
        return {
          minY: 0,
          maxY: 1.22,
          halfW: 0.68,
          halfD: 1.52,
          ownSpeed: 16,
          isRooftop: false,
          hasRamp: false,
        };
      case 'CARGO_VAN':
        return {
          minY: 0,
          maxY: 1.68,
          halfW: 0.74,
          halfD: 1.88,
          ownSpeed: 13.5,
          isRooftop: false,
          hasRamp: false,
        };
      case 'HOVER_TRUCK':
        return {
          minY: 0,
          maxY: 1.78,
          halfW: 0.78,
          halfD: 2.15,
          ownSpeed: 12,
          isRooftop: false,
          hasRamp: false,
        };
      case 'PARKED_BUS':
        return {
          minY: 0,
          maxY: 1.95,
          halfW: 0.82,
          halfD: 4.5,
          ownSpeed: 0,
          isRooftop: true,
          hasRamp: false,
        };
      case 'PARKED_HEAVY_TRUCK':
        return {
          minY: 0,
          maxY: 2.02,
          halfW: 0.84,
          halfD: 4.6,
          ownSpeed: 0,
          isRooftop: true,
          hasRamp: false,
        };
      case 'PARKED_RAMP_TRUCK':
        return {
          minY: 0,
          maxY: 1.95,
          halfW: 0.84,
          halfD: 4.8,
          ownSpeed: 0,
          isRooftop: true,
          hasRamp: true,
        };
    }
  }

  private createObstacleMesh(
    kind: ObstacleKind,
    paintMat: THREE.Material,
    darkMetalMat: THREE.Material,
    glassMat: THREE.Material,
    redGlowMat: THREE.Material,
    amberGlowMat: THREE.Material,
    cyanGlowMat: THREE.Material,
    purpleGlowMat: THREE.Material,
    isSoftwareGl: boolean
  ): THREE.Group {
    const g = new THREE.Group();

    if (kind === 'CYBER_SEDAN') {
      // Variant 1: Sleek futuristic Cyber Sedan
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.46, 3.55), paintMat);
      lower.position.y = 0.36;
      lower.castShadow = !isSoftwareGl;

      const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), glassMat);
      cabin.scale.set(0.9, 0.54, 1.55);
      cabin.position.set(0, 0.74, 0.1);

      const tailLight = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.1, 0.08), redGlowMat);
      tailLight.position.set(0, 0.5, 1.76);

      const headLight = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.08, 0.08), cyanGlowMat);
      headLight.position.set(0, 0.42, -1.76);

      g.add(lower, cabin, tailLight, headLight);
    } else if (kind === 'CARGO_VAN') {
      // Variant 2: Futuristic Delivery Cargo Van
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 1.42, 4.15), paintMat);
      body.position.set(0, 0.92, 0);
      body.castShadow = !isSoftwareGl;

      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.32, 4.25), darkMetalMat);
      bumper.position.set(0, 0.28, 0);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.58, 0.9), glassMat);
      windshield.position.set(0, 1.18, -1.68);

      const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.1, 3.4), cyanGlowMat);
      sideTrim.position.set(0, 0.72, 0.2);

      const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.14, 0.1), redGlowMat);
      tailBar.position.set(0, 0.85, 2.06);

      const roofBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.25), amberGlowMat);
      roofBeacon.position.set(0, 1.68, -1.2);

      g.add(body, bumper, windshield, sideTrim, tailBar, roofBeacon);
    } else if (kind === 'HOVER_TRUCK') {
      // Variant 3: Heavy Cyber Hover-Pickup / Transport Truck
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.42, 4.7), darkMetalMat);
      chassis.position.set(0, 0.36, 0);

      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.25, 1.85), paintMat);
      cab.position.set(0, 1.12, -1.32);
      cab.castShadow = !isSoftwareGl;

      const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.52, 1.1), glassMat);
      cabGlass.position.set(0, 1.32, -1.52);

      const cargoBed = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.88, 2.65), paintMat);
      cargoBed.position.set(0, 0.95, 0.98);

      const hoverStrip = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.1, 4.4), purpleGlowMat);
      hoverStrip.position.set(0, 0.22, 0);

      const tailLight = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.16, 0.1), redGlowMat);
      tailLight.position.set(0, 0.82, 2.34);

      g.add(chassis, cab, cabGlass, cargoBed, hoverStrip, tailLight);
    } else if (kind === 'PARKED_BUS') {
      // Subway Surfers Style Stationary Obstacle 1: Stalled Futuristic Transit Bus
      const busHull = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.72, 9.6), paintMat);
      busHull.position.set(0, 1.06, 0);
      busHull.castShadow = !isSoftwareGl;
      busHull.receiveShadow = !isSoftwareGl;

      const lowerSkirt = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.36, 9.7), darkMetalMat);
      lowerSkirt.position.set(0, 0.28, 0);

      const windowBand = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.58, 8.9), glassMat);
      windowBand.position.set(0, 1.34, 0);

      // Walkable/Driveable Rooftop Deck with glowing guide rails
      const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.1, 9.4), darkMetalMat);
      roofDeck.position.set(0, 1.94, 0);

      const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 9.2), cyanGlowMat);
      leftRail.position.set(-0.92, 1.98, 0);
      const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 9.2), cyanGlowMat);
      rightRail.position.set(0.92, 1.98, 0);

      // Rear Hazard Beacons facing the approaching player (+Z)
      const hazardTop = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.16, 0.12), amberGlowMat);
      hazardTop.position.set(0, 1.82, 4.8);
      const hazardBot = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.18, 0.12), redGlowMat);
      hazardBot.position.set(0, 0.62, 4.8);

      g.add(busHull, lowerSkirt, windowBand, roofDeck, leftRail, rightRail, hazardTop, hazardBot);
    } else if (kind === 'PARKED_HEAVY_TRUCK') {
      // Subway Surfers Style Stationary Obstacle 2: Parked Heavy Freight Container Truck
      const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.78, 7.6), paintMat);
      trailer.position.set(0, 1.12, 1.05);
      trailer.castShadow = !isSoftwareGl;
      trailer.receiveShadow = !isSoftwareGl;

      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.65, 2.0), darkMetalMat);
      cab.position.set(0, 1.02, -3.95);

      const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.55, 0.8), glassMat);
      cabGlass.position.set(0, 1.36, -4.6);

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.34, 9.8), darkMetalMat);
      chassis.position.set(0, 0.26, 0);

      const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.08, 7.5), darkMetalMat);
      roofDeck.position.set(0, 2.02, 1.05);

      const rearHazard = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.2, 0.12), redGlowMat);
      rearHazard.position.set(0, 1.85, 4.86);

      const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.18, 0.12), amberGlowMat);
      rearBumper.position.set(0, 0.58, 4.86);

      g.add(trailer, cab, cabGlass, chassis, roofDeck, rearHazard, rearBumper);
    } else {
      // Subway Surfers Style Obstacle 3: PARKED_RAMP_TRUCK (boarding ramp + rooftop deck!)
      // Flat rear section (from z = -5.0 to z = +1.0) at height 1.95
      const flatDeck = new THREE.Mesh(new THREE.BoxGeometry(2.08, 1.72, 6.0), paintMat);
      flatDeck.position.set(0, 1.06, -2.0);
      flatDeck.castShadow = !isSoftwareGl;

      // Sloped boarding ramp on the +Z end (from z = +1.0 to z = +5.0) so player drives right up!
      const rampLength = 4.25;
      const rampDeck = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.28, rampLength), darkMetalMat);
      rampDeck.position.set(0, 0.98, 2.95);
      rampDeck.rotation.x = 0.44; // Smooth incline from road (z = +5.0, y = 0.05) up to roof (z = +1.0, y = 1.95)

      const leftChevron = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.32, rampLength),
        cyanGlowMat
      );
      leftChevron.position.set(-0.96, 1.02, 2.95);
      leftChevron.rotation.x = 0.44;

      const rightChevron = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.32, rampLength),
        cyanGlowMat
      );
      rightChevron.position.set(0.96, 1.02, 2.95);
      rightChevron.rotation.x = 0.44;

      const topRailL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 5.9), cyanGlowMat);
      topRailL.position.set(-0.96, 1.96, -2.0);
      const topRailR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 5.9), cyanGlowMat);
      topRailR.position.set(0.96, 1.96, -2.0);

      g.add(flatDeck, rampDeck, leftChevron, rightChevron, topRailL, topRailR);
    }

    return g;
  }

  private acquireObstacle(kind: ObstacleKind): ActiveObstacle | null {
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (!o.active && o.kind === kind) {
        o.active = true;
        o.ownSpeed = o.baseOwnSpeed;
        o.passedPlayer = false;
        o.playerWasCloseInLane = false;
        o.mesh.visible = true;
        return o;
      }
    }
    return null;
  }

  private acquireCollectible(kind: CollectibleKind): ActiveCollectible | null {
    for (let i = 0; i < this.collectibles.length; i++) {
      const c = this.collectibles[i];
      if (!c.active && c.kind === kind) {
        c.active = true;
        c.mesh.visible = true;
        return c;
      }
    }
    return null;
  }

  /**
   * Checks if spawning an obstacle in `lane` at `zPos` with `halfD` is free of any spacing conflict,
   * and returns the safe maximum speed so a newly spawned vehicle never catches up and clips into
   * a slower or stationary vehicle in the same lane.
   */
  private getSafeLaneSpawnInfo(
    lane: number,
    zPos: number,
    candidateHalfD: number
  ): { canSpawn: boolean; maxAllowedSpeed: number } {
    let maxAllowedSpeed = 999;

    for (let i = 0; i < this.obstacles.length; i++) {
      const other = this.obstacles[i];
      if (!other.active || other.lane !== lane) continue;

      const minGap = other.halfD + candidateHalfD + 16.0;
      const distZ = Math.abs(other.z - zPos);
      if (distZ < minGap) {
        return { canSpawn: false, maxAllowedSpeed: 0 };
      }

      // If another obstacle is within 48m in the same lane, cap speed so they cannot collide
      if (distZ < 48) {
        maxAllowedSpeed = Math.min(maxAllowedSpeed, other.ownSpeed);
      }
    }

    return { canSpawn: true, maxAllowedSpeed };
  }

  private spawnWave(zPos: number, difficultyRatio: number): void {
    this.waveCounter++;
    const lanes = [-1, 0, 1];
    // Always guarantee at least 1 open ground lane
    const safeGroundLaneIdx = Math.floor(Math.random() * 3);
    const isSlalomWave = this.waveCounter % 4 === 0;

    lanes.forEach((lane, idx) => {
      const laneX = lane * LANE_WIDTH;

      if (idx === safeGroundLaneIdx) {
        if (isSlalomWave) {
          this.spawnSlalomCoinWave(zPos);
        } else {
          this.spawnCoinLine(laneX, zPos, 5, 0.85, false);
        }
        return;
      }

      const obsRoll = Math.random();

      // 48% chance of Subway-Surfers-style stationary/parked vehicle (Bus, Heavy Truck, or Ramp Truck)
      if (obsRoll < 0.48) {
        const parkedKinds: ObstacleKind[] = [
          'PARKED_RAMP_TRUCK',
          'PARKED_BUS',
          'PARKED_HEAVY_TRUCK',
        ];
        const chosenKind =
          obsRoll < 0.18
            ? 'PARKED_RAMP_TRUCK'
            : parkedKinds[Math.floor(Math.random() * parkedKinds.length)];

        const check = this.getSafeLaneSpawnInfo(lane, zPos, 4.8);
        if (!check.canSpawn) return;

        // Also avoid spawning a parked vehicle right behind a moving vehicle in the same lane
        const hasMovingAheadInLane = this.obstacles.some(
          (o) => o.active && o.lane === lane && o.ownSpeed > 0 && Math.abs(o.z - zPos) < 55
        );
        if (hasMovingAheadInLane) return;

        const parked = this.acquireObstacle(chosenKind);
        if (parked) {
          parked.lane = lane;
          parked.x = laneX;
          parked.z = zPos;
          parked.ownSpeed = 0;
          parked.mesh.position.set(laneX, 0, zPos);

          // Spawn overhead rooftop coins along the top of the parked vehicle!
          this.spawnCoinLine(laneX, zPos - 0.5, 5, parked.maxY + 0.72, false);
        }
      } else if (obsRoll < 0.90) {
        // Varied Moving Traffic Vehicle (Cyber Sedan, Cargo Van, or Hover Truck)
        const trafficKinds: ObstacleKind[] = ['CYBER_SEDAN', 'CARGO_VAN', 'HOVER_TRUCK'];
        const chosenTraffic = trafficKinds[Math.floor(Math.random() * trafficKinds.length)];

        const check = this.getSafeLaneSpawnInfo(lane, zPos, 2.2);
        if (!check.canSpawn || check.maxAllowedSpeed <= 0) {
          // If a parked vehicle is nearby in this lane, spawn a coin line instead so traffic never Rear-Ends it
          this.spawnCoinLine(laneX, zPos, 4, 0.85, false);
          return;
        }

        const vehicle = this.acquireObstacle(chosenTraffic);
        if (vehicle) {
          vehicle.lane = lane;
          vehicle.x = laneX;
          vehicle.z = zPos;
          const desiredSpeed = vehicle.baseOwnSpeed + difficultyRatio * 4.5;
          vehicle.ownSpeed = Math.min(desiredSpeed, check.maxAllowedSpeed);
          vehicle.mesh.position.set(laneX, 0, zPos);

          if (Math.random() < 0.35) {
            this.spawnCoinLine(laneX, zPos, 4, 2.8, true);
          }
        }
      } else {
        this.spawnPowerup(laneX, Math.random() > 0.45 ? 0.95 : 2.75, zPos);
      }
    });

    // Balanced, rarer Flight Energy Orb spawns (14% chance per wave) so flying is tactical
    if (Math.random() < 0.14) {
      const orbLane = lanes[Math.floor(Math.random() * 3)] * LANE_WIDTH;
      const orb = this.acquireCollectible('ENERGY_ORB');
      if (orb) {
        orb.x = orbLane;
        orb.y = Math.random() > 0.45 ? 0.95 : 2.75;
        orb.z = zPos - 14;
        orb.mesh.position.set(orb.x, orb.y, orb.z);
      }
    }
  }

  private spawnCoinLine(
    x: number,
    centerZ: number,
    count: number,
    baseY: number,
    arc: boolean
  ): void {
    const spacing = 2.9;
    for (let i = 0; i < count; i++) {
      const coin = this.acquireCollectible('COIN');
      if (!coin) break;
      const offset = (i - (count - 1) / 2) * spacing;
      const arcBoost = arc ? Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 1.15 : 0;
      coin.x = x;
      coin.y = baseY + arcBoost;
      coin.z = centerZ + offset;
      coin.mesh.position.set(coin.x, coin.y, coin.z);
    }
  }

  private spawnSlalomCoinWave(centerZ: number): void {
    const pattern = [-1, 0, 1, 0, -1];
    for (let i = 0; i < pattern.length; i++) {
      const coin = this.acquireCollectible('COIN');
      if (!coin) break;
      coin.x = pattern[i] * LANE_WIDTH;
      coin.y = 0.88;
      coin.z = centerZ - i * 3.4;
      coin.mesh.position.set(coin.x, coin.y, coin.z);
    }
  }

  private spawnPowerup(x: number, y: number, z: number): void {
    const roll = Math.random();
    const kind: CollectibleKind =
      roll < 0.22
        ? 'ENERGY_ORB'
        : roll < 0.50
        ? 'TURBO'
        : roll < 0.76
        ? 'MAGNET'
        : 'SHIELD';
    const item = this.acquireCollectible(kind);
    if (item) {
      item.x = x;
      item.y = y;
      item.z = z;
      item.mesh.position.set(x, y, z);
    }
  }

  /**
   * Updates all traffic, parked rooftop obstacles, and collectibles.
   * Returns `supportY` (the rooftop elevation directly under the player if riding on a parked bus/truck).
   */
  public update(
    dt: number,
    elapsed: number,
    forwardSpeed: number,
    difficultyRatio: number,
    carX: number,
    carY: number,
    magnetRadius: number,
    callbacks: CollisionCallbacks
  ): number {
    // 1. Spawn waves with clean spacing
    this.spawnTimer -= forwardSpeed * dt;
    if (this.spawnTimer <= 0) {
      const waveIntervalDist = Math.max(25, 36 - difficultyRatio * 10);
      this.spawnTimer = waveIntervalDist;
      this.spawnWave(-142, difficultyRatio);
    }

    // 2. Traffic Anti-Overlap & Speed-Matching Pass (prevents any vehicle from driving through another)
    for (let i = 0; i < this.obstacles.length; i++) {
      const b = this.obstacles[i];
      if (!b.active || b.ownSpeed <= 0) continue;

      for (let j = 0; j < this.obstacles.length; j++) {
        if (i === j) continue;
        const a = this.obstacles[j];
        if (!a.active || a.lane !== b.lane) continue;

        // In world space (-Z is forward), obstacle `a` is ahead of `b` if `a.z < b.z`
        if (a.z < b.z) {
          const minSafeDist = a.halfD + b.halfD + 6.5;
          const gap = b.z - a.z;
          if (gap < minSafeDist) {
            if (b.ownSpeed > a.ownSpeed) {
              b.ownSpeed = a.ownSpeed;
            }
            b.z = Math.max(b.z, a.z + minSafeDist);
          }
        }
      }
    }

    // Tightened player collision bounding box to avoid premature crashes
    const carMinY = carY + 0.18;
    const carMaxY = carY + 0.88;
    const carHalfW = 0.56;
    const carHalfD = 1.38;

    let activeRooftopSupportY = 0;

    // 3. Move & Collide Obstacles + Handle Subway-Surfers Rooftop Driving & Ramps
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (!o.active) continue;

      const relativeSpeed = forwardSpeed - o.ownSpeed;
      o.z += relativeSpeed * dt;
      o.mesh.position.z = o.z;

      if (o.z > 20) {
        o.active = false;
        o.mesh.visible = false;
        continue;
      }

      // Track if player was in the same lane right ahead of the obstacle (for last-second dodge Near Miss)
      if (o.z > -16 && o.z < -2.5 && Math.abs(o.x - carX) < 1.0) {
        o.playerWasCloseInLane = true;
      }

      const overlapZ = Math.abs(o.z) < o.halfD + carHalfD;
      const overlapX = Math.abs(o.x - carX) < o.halfW + carHalfW;

      // Check Subway-Surfers-style Rooftop & Ramp interaction for parked vehicles
      if (o.isRooftop && overlapZ && Math.abs(o.x - carX) < o.halfW + 0.65) {
        if (o.hasRamp) {
          // On a PARKED_RAMP_TRUCK, the front (+Z end, from o.z + 1.0 to o.z + o.halfD) is an inclined ramp
          // Player at z = 0 is at local coordinate `localZ = -o.z` relative to obstacle center
          const localZ = -o.z;
          const rampStartLocalZ = o.halfD; // +4.8 (front tip facing player)
          const rampTopLocalZ = 0.8;       // +0.8 (where flat roof begins)
          if (localZ >= rampTopLocalZ && localZ <= rampStartLocalZ + 1.2) {
            const rampProgress = THREE.MathUtils.clamp(
              (rampStartLocalZ - localZ) / (rampStartLocalZ - rampTopLocalZ),
              0,
              1
            );
            const rampHeight = rampProgress * o.maxY;
            if (carY >= rampHeight - 0.65) {
              activeRooftopSupportY = Math.max(activeRooftopSupportY, rampHeight);
              continue;
            }
          }
        }

        // If player is at or above rooftop height (via ramp, jump, or VTOL hover), ride on the roof!
        if (carY >= o.maxY - 0.52) {
          activeRooftopSupportY = Math.max(activeRooftopSupportY, o.maxY);
          if (!o.passedPlayer && o.z > o.halfD) {
            o.passedPlayer = true;
            callbacks.onSkyClear(o.kind);
          }
          continue;
        }
      }

      const overlapY = carMaxY > o.minY && carMinY < o.maxY;

      if (overlapZ && overlapX && overlapY) {
        o.active = false;
        o.mesh.visible = false;
        callbacks.onObstacleHit(o);
        continue;
      }

      // Check when obstacle just passes behind the player
      if (!o.passedPlayer && o.z > o.halfD + 0.4) {
        o.passedPlayer = true;
        const distX = Math.abs(o.x - carX);

        if (distX < 1.3 && !overlapY) {
          callbacks.onSkyClear(o.kind);
        } else if (
          overlapY &&
          (o.playerWasCloseInLane || (distX >= 1.25 && distX <= 3.55))
        ) {
          callbacks.onNearMiss(o.kind, o.x, o.z);
        }
      }
    }

    // 4. Move, Spin, Magnet-Pull & Collect Collectibles
    for (let i = 0; i < this.collectibles.length; i++) {
      const c = this.collectibles[i];
      if (!c.active) continue;

      c.z += forwardSpeed * dt;

      if (c.z > 14) {
        c.active = false;
        c.mesh.visible = false;
        continue;
      }

      // Magnetic attraction for Coins
      if (c.kind === 'COIN' && c.z > -24 && c.z < 4) {
        const dx = carX - c.x;
        const dy = carY + 0.6 - c.y;
        const distSq = dx * dx + dy * dy + c.z * c.z;
        if (distSq < magnetRadius * magnetRadius) {
          const pullSpeed = magnetRadius > 5 ? 15.0 : 9.5;
          c.x += dx * dt * pullSpeed;
          c.y += dy * dt * pullSpeed;
        }
      }

      c.mesh.position.set(c.x, c.y + Math.sin(elapsed * 4.5 + i) * 0.08, c.z);
      c.mesh.rotation.y += dt * 3.4;

      const hitX = Math.abs(c.x - carX) < 1.35;
      const hitY = Math.abs(c.y - (carY + 0.62)) < 1.35;
      const hitZ = Math.abs(c.z) < 2.05;

      if (hitX && hitY && hitZ) {
        c.active = false;
        c.mesh.visible = false;

        if (c.kind === 'COIN') {
          callbacks.onCoinCollected(c.x, c.y, c.z);
        } else if (c.kind === 'ENERGY_ORB') {
          callbacks.onEnergyOrbCollected(c.x, c.y, c.z);
        } else if (c.kind === 'TURBO') {
          callbacks.onTurboCollected(c.x, c.y, c.z);
        } else if (c.kind === 'SHIELD') {
          callbacks.onShieldCollected(c.x, c.y, c.z);
        } else if (c.kind === 'MAGNET') {
          callbacks.onMagnetCollected(c.x, c.y, c.z);
        }
      }
    }

    return activeRooftopSupportY;
  }

  public reset(): void {
    this.spawnTimer = 8;
    this.waveCounter = 0;
    for (let i = 0; i < this.obstacles.length; i++) {
      this.obstacles[i].active = false;
      this.obstacles[i].mesh.visible = false;
    }
    for (let i = 0; i < this.collectibles.length; i++) {
      this.collectibles[i].active = false;
      this.collectibles[i].mesh.visible = false;
    }
    this.spawnWave(-46, 0);
    this.spawnWave(-84, 0.05);
    this.spawnWave(-122, 0.1);
  }
}
