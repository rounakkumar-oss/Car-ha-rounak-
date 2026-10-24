import * as THREE from 'three';

export const LANE_WIDTH = 3.4;
export const ROAD_WIDTH = 12.6;
export const SEGMENT_LENGTH = 26;
export const SEGMENT_COUNT = 13;

function createRoadAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Deep reflective dark carbon-asphalt base
  ctx.fillStyle = '#0a0f1d';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle wet-asphalt specular streaks & micro-grain
  for (let i = 0; i < 2800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 14 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgb(${v}, ${v + 5}, ${v + 16})`;
    ctx.fillRect(x, y, 2, 4);
  }

  // Outer glowing cyan/purple highway boundary strips
  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(10, 0, 8, 512);
  ctx.fillRect(494, 0, 8, 512);

  ctx.fillStyle = '#a855f7';
  ctx.fillRect(22, 0, 4, 512);
  ctx.fillRect(486, 0, 4, 512);

  // Crisp 3-Lane dashed neon dividers
  ctx.fillStyle = '#38bdf8';
  const laneX1 = Math.floor(512 * 0.345);
  const laneX2 = Math.floor(512 * 0.655);
  for (let y = 18; y < 512; y += 128) {
    ctx.fillRect(laneX1 - 3, y, 6, 76);
    ctx.fillRect(laneX2 - 3, y, 6, 76);
  }

  // Subtle center lane guide chevron ticks for enhanced speed perception
  ctx.fillStyle = 'rgba(56, 189, 248, 0.26)';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(84, y, 10, 4);
    ctx.fillRect(251, y, 10, 4);
    ctx.fillRect(418, y, 10, 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createBuildingWindowTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070b16';
  ctx.fillRect(0, 0, 256, 512);

  const cols = 8;
  const rows = 24;
  const padX = 8;
  const padY = 6;
  const cellW = 256 / cols;
  const cellH = 512 / rows;

  const palette = ['#22d3ee', '#818cf8', '#c084fc', '#38bdf8', '#f472b6', '#fbbf24'];

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() > 0.35) {
        const color = palette[Math.floor(Math.random() * palette.length)];
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.45 + Math.random() * 0.5;
        ctx.fillRect(
          c * cellW + padX * 0.5,
          r * cellH + padY * 0.5,
          cellW - padX,
          cellH - padY
        );
      }
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export class EnvironmentManager {
  public root = new THREE.Group();
  private segments: THREE.Group[] = [];
  private sunDisc: THREE.Mesh;
  private sunGlow: THREE.Mesh;
  private skyMat: THREE.MeshBasicMaterial;
  private roadMat: THREE.MeshStandardMaterial;
  private archNeonMat: THREE.MeshStandardMaterial;
  private scene: THREE.Scene;
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private currentTheme: 'SUNSET' | 'NIGHT' = 'NIGHT';

  constructor(scene: THREE.Scene, maxAnisotropy: number, isSoftwareGl: boolean) {
    this.scene = scene;
    scene.add(this.root);

    // Lighting rig: Warm directional key light + cool HemisphereLight fill
    this.hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e1b4b, 1.45);
    scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfef08a, 2.3);
    this.dirLight.position.set(14, 28, 18);
    if (!isSoftwareGl) {
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.camera.near = 2;
      this.dirLight.shadow.camera.far = 75;
      const d = 16;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.bias = -0.0005;
      this.dirLight.shadow.normalBias = 0.02;
    }
    scene.add(this.dirLight);

    scene.background = new THREE.Color(0x060916);
    scene.fog = new THREE.FogExp2(0x080c22, 0.0065);

    // Distant Horizon Sun / Cyber Core Backdrop
    const sunGroup = new THREE.Group();
    sunGroup.position.set(0, 26, -245);
    this.root.add(sunGroup);

    const sunGeo = new THREE.CircleGeometry(36, 36);
    this.skyMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      fog: false,
    });
    this.sunDisc = new THREE.Mesh(sunGeo, this.skyMat);
    sunGroup.add(this.sunDisc);

    const sunHaloGeo = new THREE.RingGeometry(36.5, 54, 36);
    const sunHaloMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.sunGlow = new THREE.Mesh(sunHaloGeo, sunHaloMat);
    sunGroup.add(this.sunGlow);

    const roadTex = createRoadAsphaltTexture(maxAnisotropy);
    this.roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.22,
      metalness: 0.42,
    });

    const buildingTex = createBuildingWindowTexture(maxAnisotropy);
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      map: buildingTex,
      emissive: 0x38bdf8,
      emissiveMap: buildingTex,
      emissiveIntensity: 0.9,
      roughness: 0.32,
      metalness: 0.65,
    });

    const railMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.28,
      metalness: 0.82,
    });

    this.archNeonMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    });

    const purpleNeonMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0xa855f7,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });

    const roadPlaneGeo = new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_LENGTH);
    roadPlaneGeo.rotateX(-Math.PI / 2);

    const underDeckGeo = new THREE.BoxGeometry(ROAD_WIDTH + 1.4, 0.9, SEGMENT_LENGTH);
    const railGeo = new THREE.BoxGeometry(0.32, 0.65, SEGMENT_LENGTH);
    const railNeonGeo = new THREE.BoxGeometry(0.14, 0.14, SEGMENT_LENGTH);
    const pylonGeo = new THREE.BoxGeometry(0.28, 6.2, 0.28);
    const pylonArmGeo = new THREE.BoxGeometry(2.1, 0.16, 0.22);
    const pylonLightGeo = new THREE.BoxGeometry(1.4, 0.12, 0.26);

    const archPillarGeo = new THREE.BoxGeometry(0.65, 9.5, 0.85);
    const archCrossbarGeo = new THREE.BoxGeometry(ROAD_WIDTH + 2.4, 0.75, 0.95);
    const archNeonStripGeo = new THREE.BoxGeometry(ROAD_WIDTH + 1.8, 0.2, 1.02);

    // Laser Tunnel Rib Geometry for dramatic tunnel sections
    const tunnelRibGeo = new THREE.TorusGeometry(ROAD_WIDTH * 0.58, 0.22, 8, 24, Math.PI);

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = new THREE.Group();
      seg.position.z = -i * SEGMENT_LENGTH;

      const roadMesh = new THREE.Mesh(roadPlaneGeo, this.roadMat);
      roadMesh.receiveShadow = !isSoftwareGl;
      seg.add(roadMesh);

      const deckMesh = new THREE.Mesh(underDeckGeo, railMat);
      deckMesh.position.y = -0.48;
      seg.add(deckMesh);

      [-ROAD_WIDTH / 2 - 0.25, ROAD_WIDTH / 2 + 0.25].forEach((rx, sideIdx) => {
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(rx, 0.32, 0);
        seg.add(rail);

        const railNeon = new THREE.Mesh(
          railNeonGeo,
          sideIdx === 0 ? this.archNeonMat : purpleNeonMat
        );
        railNeon.position.set(rx + (sideIdx === 0 ? 0.18 : -0.18), 0.56, 0);
        seg.add(railNeon);
      });

      [-ROAD_WIDTH / 2 - 0.55, ROAD_WIDTH / 2 + 0.55].forEach((px, sideIdx) => {
        const pylon = new THREE.Mesh(pylonGeo, railMat);
        pylon.position.set(px, 3.1, 0);
        seg.add(pylon);

        const armDir = sideIdx === 0 ? 1 : -1;
        const arm = new THREE.Mesh(pylonArmGeo, railMat);
        arm.position.set(px + armDir * 0.9, 6.1, 0);
        seg.add(arm);

        const lamp = new THREE.Mesh(pylonLightGeo, this.archNeonMat);
        lamp.position.set(px + armDir * 1.1, 6.0, 0);
        seg.add(lamp);
      });

      // Alternate between High-Altitude Suspension Bridge Gates and Cyber Laser Tunnel Ribs
      if (i % 4 === 1) {
        const leftPillar = new THREE.Mesh(archPillarGeo, railMat);
        leftPillar.position.set(-ROAD_WIDTH / 2 - 0.8, 4.75, -SEGMENT_LENGTH * 0.25);

        const rightPillar = new THREE.Mesh(archPillarGeo, railMat);
        rightPillar.position.set(ROAD_WIDTH / 2 + 0.8, 4.75, -SEGMENT_LENGTH * 0.25);

        const crossbar = new THREE.Mesh(archCrossbarGeo, railMat);
        crossbar.position.set(0, 9.4, -SEGMENT_LENGTH * 0.25);

        const neonBeam = new THREE.Mesh(archNeonStripGeo, purpleNeonMat);
        neonBeam.position.set(0, 9.0, -SEGMENT_LENGTH * 0.25);

        seg.add(leftPillar, rightPillar, crossbar, neonBeam);
      } else if (i % 4 === 3) {
        // Futuristic Laser Tunnel Portal with 3 illuminated overhead arch ribs
        [-8, 0, 8].forEach((rz, rIdx) => {
          const rib = new THREE.Mesh(
            tunnelRibGeo,
            rIdx % 2 === 0 ? this.archNeonMat : purpleNeonMat
          );
          rib.position.set(0, 0.2, rz);
          seg.add(rib);
        });
      }

      // Flanking City Skyscrapers
      [-1, 1].forEach((side) => {
        for (let b = 0; b < 2; b++) {
          const bWidth = 5.5 + ((i * 7 + b * 3) % 5);
          const bDepth = 7.5 + ((i * 5 + b * 4) % 4);
          const bHeight = 26 + ((i * 13 + b * 11) % 40);

          const towerGroup = new THREE.Group();
          const xOffset = side * (ROAD_WIDTH / 2 + 6.5 + bWidth * 0.5 + (b % 2) * 3.5);
          const zOffset = (b - 0.5) * (SEGMENT_LENGTH * 0.5);
          towerGroup.position.set(xOffset, bHeight / 2 - 10, zOffset);

          const towerGeo = new THREE.BoxGeometry(bWidth, bHeight, bDepth);
          const towerMesh = new THREE.Mesh(towerGeo, buildingMat);
          towerGroup.add(towerMesh);

          const crownGeo = new THREE.BoxGeometry(bWidth * 0.72, 3.2, bDepth * 0.72);
          const crownMesh = new THREE.Mesh(crownGeo, railMat);
          crownMesh.position.y = bHeight / 2 + 1.6;
          towerGroup.add(crownMesh);

          const roofNeonGeo = new THREE.BoxGeometry(bWidth * 0.76, 0.28, bDepth * 0.76);
          const roofNeon = new THREE.Mesh(
            roofNeonGeo,
            (i + b) % 2 === 0 ? this.archNeonMat : purpleNeonMat
          );
          roofNeon.position.y = bHeight / 2 + 3.1;
          towerGroup.add(roofNeon);

          seg.add(towerGroup);
        }
      });

      this.root.add(seg);
      this.segments.push(seg);
    }

    this.applyTheme('NIGHT');
  }

  public applyTheme(theme: 'SUNSET' | 'NIGHT'): void {
    this.currentTheme = theme;
    if (theme === 'SUNSET') {
      (this.scene.background as THREE.Color).setHex(0x1b0b2e);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x28103e);
      this.hemiLight.color.setHex(0xf472b6);
      this.hemiLight.groundColor.setHex(0x1e1b4b);
      this.dirLight.color.setHex(0xfb923c);
      this.dirLight.intensity = 2.6;
      this.skyMat.color.setHex(0xf97316);
      this.archNeonMat.color.setHex(0xf43f5e);
      this.archNeonMat.emissive.setHex(0xf43f5e);
    } else {
      (this.scene.background as THREE.Color).setHex(0x050814);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x070c20);
      this.hemiLight.color.setHex(0x38bdf8);
      this.hemiLight.groundColor.setHex(0x0f172a);
      this.dirLight.color.setHex(0xe0f2fe);
      this.dirLight.intensity = 2.1;
      this.skyMat.color.setHex(0x6366f1);
      this.archNeonMat.color.setHex(0x06b6d4);
      this.archNeonMat.emissive.setHex(0x06b6d4);
    }
  }

  public getActiveTheme(): 'SUNSET' | 'NIGHT' {
    return this.currentTheme;
  }

  public update(dt: number, forwardSpeed: number): void {
    const moveZ = forwardSpeed * dt;
    const totalLength = SEGMENT_COUNT * SEGMENT_LENGTH;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.position.z += moveZ;

      if (seg.position.z > SEGMENT_LENGTH) {
        seg.position.z -= totalLength;
      }
    }
  }

  public reset(): void {
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].position.z = -i * SEGMENT_LENGTH;
    }
  }
}
