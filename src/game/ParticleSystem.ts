import * as THREE from 'three';

interface ParticleData {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  color: THREE.Color;
}

interface SpeedStreakData {
  x: number;
  y: number;
  z: number;
  length: number;
  color: THREE.Color;
}

const MAX_PARTICLES = 220;
const MAX_SPEED_STREAKS = 48;
const _dummy = new THREE.Object3D();

export class ParticleSystem {
  private instancedMesh: THREE.InstancedMesh;
  private streakMesh: THREE.InstancedMesh;
  private streakMat: THREE.MeshBasicMaterial;
  private particles: ParticleData[] = [];
  private streaks: SpeedStreakData[] = [];
  private nextIdx = 0;

  constructor(scene: THREE.Scene) {
    // 1. Pooled Exhaust / Spark / Pickup Burst Particles
    const geo = new THREE.OctahedronGeometry(0.14, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_PARTICLES * 3),
      3
    );

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scaleX: 0,
        scaleY: 0,
        scaleZ: 0,
        color: new THREE.Color(0x38bdf8),
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, _dummy.matrix);
      this.instancedMesh.setColorAt(i, this.particles[i].color);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.instancedMesh.instanceColor.needsUpdate = true;
    scene.add(this.instancedMesh);

    // 2. High-Speed Wind / Velocity Streaks around the Highway Perimeter
    const streakGeo = new THREE.BoxGeometry(0.035, 0.035, 1.0);
    this.streakMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.streakMesh = new THREE.InstancedMesh(streakGeo, this.streakMat, MAX_SPEED_STREAKS);
    this.streakMesh.frustumCulled = false;
    this.streakMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_SPEED_STREAKS * 3),
      3
    );

    const streakPalette = [0xe0f2fe, 0x38bdf8, 0xa855f7, 0x67e8f9];
    for (let i = 0; i < MAX_SPEED_STREAKS; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = side * (5.2 + Math.random() * 5.5);
      const sy = 0.4 + Math.random() * 6.5;
      const sz = -Math.random() * 140;
      const len = 3.5 + Math.random() * 5.5;
      const col = new THREE.Color(streakPalette[i % streakPalette.length]);

      this.streaks.push({ x: sx, y: sy, z: sz, length: len, color: col });
      _dummy.position.set(sx, sy, sz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, len);
      _dummy.updateMatrix();
      this.streakMesh.setMatrixAt(i, _dummy.matrix);
      this.streakMesh.setColorAt(i, col);
    }
    this.streakMesh.instanceMatrix.needsUpdate = true;
    this.streakMesh.instanceColor.needsUpdate = true;
    scene.add(this.streakMesh);
  }

  public spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorHex: number,
    scale = 1,
    maxLife = 0.42,
    elongateY = 1.0
  ): void {
    const p = this.particles[this.nextIdx];
    this.nextIdx = (this.nextIdx + 1) % MAX_PARTICLES;

    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.scaleX = scale;
    p.scaleY = scale * elongateY;
    p.scaleZ = scale;
    p.color.setHex(colorHex);
  }

  public emitBurst(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count = 16,
    speed = 6.5,
    scale = 1.05
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.25) * Math.PI;
      const spd = speed * (0.4 + Math.random() * 0.85);
      this.spawnParticle(
        x,
        y,
        z,
        Math.cos(angle) * Math.cos(elev) * spd,
        Math.sin(elev) * spd + 1.4,
        Math.sin(angle) * Math.cos(elev) * spd,
        colorHex,
        scale * (0.65 + Math.random() * 0.65),
        0.32 + Math.random() * 0.26
      );
    }
  }

  public emitTakeoffShockwave(carX: number, carZ: number): void {
    const ringCount = 24;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const radialSpeed = 6.5 + Math.random() * 3.5;
      this.spawnParticle(
        carX + Math.cos(angle) * 0.6,
        0.16,
        carZ + Math.sin(angle) * 0.9,
        Math.cos(angle) * radialSpeed,
        0.8 + Math.random() * 1.4,
        Math.sin(angle) * radialSpeed + 6,
        i % 2 === 0 ? 0xe0f2fe : 0x38bdf8,
        1.15,
        0.36
      );
    }
  }

  public emitLandingDust(carX: number, carZ: number): void {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const spd = 4.5 + Math.random() * 3.0;
      this.spawnParticle(
        carX + Math.cos(angle) * 0.7,
        0.12,
        carZ + Math.sin(angle) * 1.1,
        Math.cos(angle) * spd,
        0.5 + Math.random() * 1.0,
        Math.sin(angle) * spd + 8,
        i % 3 === 0 ? 0x67e8f9 : 0x94a3b8,
        1.1,
        0.34
      );
    }
  }

  public emitThrusterMist(
    carX: number,
    carY: number,
    carZ: number,
    thrusterColor: number,
    isTurbo: boolean
  ): void {
    // Emit downward-shooting sparks directly from the 4 underside VTOL nozzles
    const nozzles: [number, number][] = [
      [-0.60, -1.12],
      [0.60, -1.12],
      [-0.64, 1.08],
      [0.64, 1.08],
    ];

    for (let n = 0; n < 2; n++) {
      const pick = nozzles[Math.floor(Math.random() * nozzles.length)];
      const sparkColor =
        Math.random() > 0.55 ? 0xe0f2fe : Math.random() > 0.3 ? 0x38bdf8 : thrusterColor;
      this.spawnParticle(
        carX + pick[0] + (Math.random() - 0.5) * 0.14,
        carY + 0.12,
        carZ + pick[1] + (Math.random() - 0.5) * 0.14,
        (Math.random() - 0.5) * 1.5,
        -9.5 - Math.random() * 4.5,
        8.5 + Math.random() * 4.0,
        sparkColor,
        isTurbo ? 0.95 : 0.72,
        0.22,
        2.2 // Vertically elongated downward plasma spark
      );
    }

    // Ground-level outward wash mist when hovering over road
    if (carY < 3.8) {
      const side = Math.random() > 0.5 ? 1 : -1;
      this.spawnParticle(
        carX + side * (0.4 + Math.random() * 0.8),
        0.12,
        carZ + (Math.random() - 0.3) * 1.8,
        side * (3.2 + Math.random() * 3.5),
        0.35 + Math.random() * 0.6,
        10.0 + Math.random() * 4.0,
        Math.random() > 0.45 ? 0x7dd3fc : 0xa855f7,
        1.15,
        0.26,
        0.65
      );
    }
  }

  public emitTurboExhaust(carX: number, carY: number, carZ: number): void {
    [-0.46, 0.46].forEach((sideX) => {
      this.spawnParticle(
        carX + sideX + (Math.random() - 0.5) * 0.12,
        carY + 0.32,
        carZ + 2.15,
        (Math.random() - 0.5) * 1.0,
        (Math.random() - 0.5) * 0.8,
        16 + Math.random() * 6,
        Math.random() > 0.4 ? 0xe0f2fe : 0x38bdf8,
        0.95,
        0.2,
        1.0
      );
    });
  }

  public update(dt: number, forwardSpeed = 30, isTurbo = false): void {
    // 1. Update Pooled Particles
    let anyUpdated = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      anyUpdated = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.08) {
        p.y = 0.08;
        p.vy = Math.abs(p.vy) * 0.22;
        p.vx *= 1.08;
      }

      const ratio = Math.max(0, p.life / p.maxLife);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(p.scaleX * ratio, p.scaleY * ratio, p.scaleZ * ratio);
      _dummy.updateMatrix();

      this.instancedMesh.setMatrixAt(i, _dummy.matrix);
      this.instancedMesh.setColorAt(i, p.color);
    }

    if (anyUpdated) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      if (this.instancedMesh.instanceColor) {
        this.instancedMesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Update High-Speed Wind / Velocity Streaks
    const speedRatio = THREE.MathUtils.clamp((forwardSpeed - 24) / 45, 0.15, 1.5);
    this.streakMat.opacity = isTurbo ? 0.72 : 0.22 + speedRatio * 0.35;
    const streakAdvance = forwardSpeed * (isTurbo ? 2.4 : 1.75) * dt;
    const lengthMul = isTurbo ? 2.1 : 0.8 + speedRatio * 0.9;

    for (let i = 0; i < MAX_SPEED_STREAKS; i++) {
      const s = this.streaks[i];
      s.z += streakAdvance;
      if (s.z > 14) {
        s.z -= 150;
      }
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, s.length * lengthMul);
      _dummy.updateMatrix();
      this.streakMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.streakMesh.instanceMatrix.needsUpdate = true;
  }

  public reset(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].active = false;
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
