import * as THREE from 'three';
import { CarSkin, FlightState } from './types';

export interface PlayerCarRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  wheels: THREE.Group[];
  vtolNozzles: THREE.Group[];
  underbodyLight: THREE.PointLight;
  shieldMesh: THREE.Group;
  magnetRingMesh: THREE.Mesh;
  contactShadow: THREE.Mesh;
  groundJetRings: THREE.Mesh[];
  triggerLandingBounce: () => void;
  applySkin: (skin: CarSkin) => void;
  updateAnimation: (
    dt: number,
    elapsed: number,
    speed: number,
    flightState: FlightState,
    altitude: number,
    steerVelocity: number,
    isTurbo: boolean,
    hasShield: boolean,
    hasMagnet: boolean
  ) => void;
}

function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 256, 18, 128, 256, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.55, 'rgba(4, 10, 28, 0.48)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createJetImpingementTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0, 'rgba(224, 242, 254, 0.95)');
  grad.addColorStop(0.35, 'rgba(56, 189, 248, 0.65)');
  grad.addColorStop(0.7, 'rgba(168, 85, 247, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPlasmaJetShaderMaterial(
  coreColorHex: number,
  midColorHex: number,
  edgeColorHex: number,
  opacityScale: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uCoreColor: { value: new THREE.Color(coreColorHex) },
      uMidColor: { value: new THREE.Color(midColorHex) },
      uEdgeColor: { value: new THREE.Color(edgeColorHex) },
      uOpacityScale: { value: opacityScale },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      uniform float uTime;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec3 pos = position;
        float tipFactor = 1.0 - vUv.y;
        float wave = sin(uTime * 42.0 + pos.y * 8.0) * 0.018 * tipFactor;
        pos.x += wave;
        pos.z += cos(uTime * 36.0 + pos.y * 8.0) * 0.018 * tipFactor;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uCoreColor;
      uniform vec3 uMidColor;
      uniform vec3 uEdgeColor;
      uniform float uOpacityScale;

      void main() {
        float h = clamp(vUv.y, 0.0, 1.0);
        vec3 viewDir = normalize(vViewPosition);
        float facing = abs(dot(normalize(vNormal), viewDir));
        float radialEdge = pow(clamp(facing, 0.0, 1.0), 0.75);

        float flow = vUv.y * 14.0 + uTime * 28.0;
        float shockDiamonds = 0.78 + 0.22 * sin(flow);
        float verticalFade = smoothstep(0.0, 0.88, h) * pow(h, 0.55);

        vec3 hotWhite = vec3(0.96, 0.99, 1.0);
        vec3 col = mix(uEdgeColor, uMidColor, smoothstep(0.15, 0.65, h * radialEdge));
        col = mix(col, uCoreColor, smoothstep(0.45, 0.85, h * radialEdge));
        col = mix(col, hotWhite, smoothstep(0.68, 0.98, h * radialEdge) * shockDiamonds);

        float alpha = verticalFade * radialEdge * shockDiamonds * uOpacityScale * uIntensity;
        gl_FragColor = vec4(col * (1.15 * uIntensity), clamp(alpha, 0.0, 0.96));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generates a realistic 3D lofted automotive body shell with compound curvature:
 * - Plan-view tapered nose & tail
 * - Flared front & rear fenders with sculpted wheel-arch cutouts
 * - Pinched Coke-bottle door waist with lower rocker character crease
 * - Smooth fastback coupe decklid & integrated ducktail Kamm-tail spoiler
 */
function buildLoftedSupercarBodyGeometry(): THREE.BufferGeometry {
  const zSteps = 76;
  const ringPts = 52;
  const zMin = -2.20; // Sleek shark-nose front tip
  const zMax = 2.18;  // Sculpted Kamm-tail rear tip

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= zSteps; iz++) {
    const v = iz / zSteps;
    const z = THREE.MathUtils.lerp(zMin, zMax, v);

    // 1. Plan-view half-width envelope (tapered aerodynamic nose, muscular front/rear fenders, pinched Coke-bottle waist)
    const frontFenderBulge = Math.exp(-Math.pow((z - -1.28) / 0.45, 2)) * 0.085;
    const rearFenderBulge = Math.exp(-Math.pow((z - 1.24) / 0.48, 2)) * 0.115;
    const doorWaistPinch = -Math.exp(-Math.pow((z - -0.02) / 0.54, 2)) * 0.05;

    let noseTaper = 1.0;
    if (z < -1.56) {
      const t = (z - zMin) / (-1.56 - zMin);
      noseTaper = 0.50 + 0.50 * Math.pow(Math.max(0, t), 0.54);
    }
    let tailTaper = 1.0;
    if (z > 1.64) {
      const t = (zMax - z) / (zMax - 1.64);
      tailTaper = 0.78 + 0.22 * Math.pow(Math.max(0, t), 0.64);
    }

    const halfWidth = (0.89 + frontFenderBulge + rearFenderBulge + doorWaistPinch) * noseTaper * tailTaper;

    // 2. Centerline top height (low-slung hood -> cabin base -> fastback rear deck -> integrated ducktail spoiler)
    let centerTopY = 0.65;
    if (z < -0.96) {
      const t = (z - zMin) / (-0.96 - zMin);
      centerTopY = 0.29 + 0.36 * Math.pow(Math.max(0, t), 0.54);
    } else if (z <= 1.22) {
      centerTopY = 0.65 + Math.sin(((z - -0.96) / 2.18) * Math.PI) * 0.03;
    } else {
      const t = (z - 1.22) / (zMax - 1.22);
      const ducktailKick = Math.exp(-Math.pow((z - 2.04) / 0.16, 2)) * 0.048;
      centerTopY = THREE.MathUtils.lerp(0.65, 0.59, t) + ducktailKick;
    }

    // Muscular fender haunches rising over front & rear wheels
    const shoulderLift =
      Math.exp(-Math.pow((z - -1.28) / 0.44, 2)) * 0.105 +
      Math.exp(-Math.pow((z - 1.24) / 0.48, 2)) * 0.12;

    // 3. Smooth semicircular wheel-arch opening profile along the outer flanks
    let underbodyY = 0.175;
    if (z < -1.84) {
      underbodyY = THREE.MathUtils.lerp(0.24, 0.175, (z - zMin) / 0.36);
    } else if (z > 1.72) {
      underbodyY = THREE.MathUtils.lerp(0.175, 0.28, (z - 1.72) / 0.46);
    }

    const dzFront = Math.abs(z - -1.28);
    const rArchFront = 0.345;
    const archOpenF =
      dzFront < rArchFront
        ? 0.295 + Math.sqrt(Math.max(0, rArchFront * rArchFront - dzFront * dzFront)) * 0.94
        : underbodyY;

    const dzRear = Math.abs(z - 1.24);
    const rArchRear = 0.36;
    const archOpenR =
      dzRear < rArchRear
        ? 0.31 + Math.sqrt(Math.max(0, rArchRear * rArchRear - dzRear * dzRear)) * 0.94
        : underbodyY;

    const archOpenY = Math.max(underbodyY, archOpenF, archOpenR);

    // Generate smooth, manifold cross-section loop
    for (let ir = 0; ir <= ringPts; ir++) {
      const u = ir / ringPts;
      const theta = u * Math.PI * 2; // 0 = top-center, PI/2 = right outer flank, PI = bottom-center

      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const sideSign = sinT >= 0 ? 1 : -1;
      const absSin = Math.abs(sinT);

      let x = 0;
      let y = 0;

      // Beltline crease stays strictly above the wheel-arch opening so upper/lower surfaces never invert
      const baseBeltY = centerTopY + shoulderLift * 0.58 - 0.03;
      const beltY = Math.max(baseBeltY, archOpenY + 0.055);

      if (cosT >= 0) {
        // Upper half of body (Hood / Sculpted Fender Shoulders / Beltline)
        const lat = Math.pow(absSin, 0.78);
        x = sideSign * lat * halfWidth;

        const shoulderCrest = Math.sin(absSin * Math.PI * 0.86);
        const topProfileY = Math.max(
          centerTopY + shoulderCrest * shoulderLift,
          beltY + 0.04 * Math.sin(absSin * Math.PI)
        );
        y = THREE.MathUtils.lerp(beltY, topProfileY, Math.pow(cosT, 0.46));
      } else {
        // Lower half of body (Outer Fender Arch Lip & Door Flank -> Rocker Sill -> Flat Undertray)
        const downFrac = -cosT; // 0 at beltline, 1 at bottom center
        const tuck = 1.0 - 0.12 * Math.pow(downFrac, 1.8);
        x = sideSign * Math.pow(absSin, 0.75) * halfWidth * tuck;

        // At outer flanks (absSin > 0.72), lift the lower edge along archOpenY to form a clean semicircular wheel arch
        const outerArchBlend = smoothstep(0.68, 0.90, absSin);
        const localBottomY = THREE.MathUtils.lerp(underbodyY, archOpenY, outerArchBlend);
        y = THREE.MathUtils.lerp(beltY, localBottomY, Math.pow(downFrac, 0.74));
      }

      // Sculpted aerodynamic side air-channel crease along the doors between the axles
      if (z > -0.84 && z < 0.80 && absSin > 0.82 && Math.abs(cosT) < 0.38) {
        const doorFactor = smoothstep(-0.84, -0.46, z) * (1 - smoothstep(0.44, 0.80, z));
        x -= sideSign * 0.032 * doorFactor;
      }

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = ringPts + 1;
  for (let iz = 0; iz < zSteps; iz++) {
    for (let ir = 0; ir < ringPts; ir++) {
      const a = iz * stride + ir;
      const b = (iz + 1) * stride + ir;
      const c = (iz + 1) * stride + (ir + 1);
      const d = iz * stride + (ir + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates the flush, compound-curved 3D panoramic glass coupe greenhouse
 * (raked windshield + low-slung coupe roof + tapered fastback rear glass + side windows).
 */
function buildLoftedGlassCanopyGeometry(): THREE.BufferGeometry {
  const zSteps = 38;
  const xSteps = 30;
  const zStart = -1.14; // Raked windshield base
  const zEnd = 1.58;    // Fastback rear glass tip

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= zSteps; iz++) {
    const v = iz / zSteps;
    const z = THREE.MathUtils.lerp(zStart, zEnd, v);

    // Longitudinal teardrop roof arch profile
    let archHeight = 0;
    if (v < 0.40) {
      const t = v / 0.40;
      archHeight = Math.sin(t * (Math.PI / 2)) * 0.33;
    } else {
      const t = (v - 0.40) / 0.60;
      archHeight = Math.cos(t * (Math.PI / 2)) * 0.33;
    }

    // Plan-view width of greenhouse (teardrop taper toward the rear deck)
    const baseHalfW =
      v < 0.34
        ? THREE.MathUtils.lerp(0.64, 0.70, v / 0.34)
        : THREE.MathUtils.lerp(0.70, 0.44, (v - 0.34) / 0.66);

    for (let ix = 0; ix <= xSteps; ix++) {
      const u = ix / xSteps;
      const s = u * 2 - 1; // -1 (left) to +1 (right)
      const absS = Math.abs(s);

      const x = s * baseHalfW * (1.0 - 0.14 * (1.0 - absS * absS));
      const crossDome = Math.cos(absS * (Math.PI / 2));
      const y = 0.63 + archHeight * Math.pow(crossDome, 0.62);

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = xSteps + 1;
  for (let iz = 0; iz < zSteps; iz++) {
    for (let ix = 0; ix < xSteps; ix++) {
      const a = iz * stride + ix;
      const b = (iz + 1) * stride + ix;
      const c = (iz + 1) * stride + (ix + 1);
      const d = iz * stride + (ix + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildFuturisticFlyingCar(
  initialSkin: CarSkin,
  isSoftwareGl: boolean
): PlayerCarRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // ==========================================================================
  // 1. REALISTIC AUTOMOTIVE PBR MATERIALS
  // ==========================================================================
  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    color: initialSkin.bodyColor,
    metalness: initialSkin.metalness,
    roughness: initialSkin.roughness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 1.0,
  });

  const darkRockerMat = new THREE.MeshStandardMaterial({
    color: 0x141923,
    metalness: 0.48,
    roughness: 0.38,
  });

  const wheelWellBlackMat = new THREE.MeshBasicMaterial({
    color: 0x05070c,
  });

  const glassCanopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x070b12,
    metalness: 0.15,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 1.0,
  });

  const accentGlowMat = new THREE.MeshStandardMaterial({
    color: initialSkin.accentColor,
    emissive: initialSkin.accentColor,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.2,
  });

  const rimMetalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.18,
    metalness: 0.88,
  });

  const aeroWheelCoverMat = new THREE.MeshStandardMaterial({
    color: 0x1e2533,
    roughness: 0.28,
    metalness: 0.72,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff1744,
    emissive: 0xff1133,
    emissiveIntensity: 3.2,
    roughness: 0.12,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.8,
    roughness: 0.1,
  });

  const nozzleApertureMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
  });

  // ==========================================================================
  // 2. LOFTED 3D SUPERCAR BODY SHELL & GREENHOUSE
  // ==========================================================================
  const bodyGeo = buildLoftedSupercarBodyGeometry();
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyPaintMat);
  bodyMesh.castShadow = !isSoftwareGl;
  bodyMesh.receiveShadow = !isSoftwareGl;
  chassisGroup.add(bodyMesh);

  const canopyGeo = buildLoftedGlassCanopyGeometry();
  const canopyMesh = new THREE.Mesh(canopyGeo, glassCanopyMat);
  chassisGroup.add(canopyMesh);

  // Body-Colored Roof Cantrails (Sleek A-to-C pillar arches framing the side windows)
  [-1, 1].forEach((sideSign) => {
    const pillarCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sideSign * 0.64, 0.64, -1.08),
      new THREE.Vector3(sideSign * 0.59, 0.86, -0.45),
      new THREE.Vector3(sideSign * 0.57, 0.92, 0.10),
      new THREE.Vector3(sideSign * 0.55, 0.83, 0.76),
      new THREE.Vector3(sideSign * 0.49, 0.67, 1.46),
    ]);
    const pillarGeo = new THREE.TubeGeometry(pillarCurve, 28, 0.030, 10, false);
    pillarGeo.scale(1.0, 0.65, 1.0);
    const pillarMesh = new THREE.Mesh(pillarGeo, bodyPaintMat);
    chassisGroup.add(pillarMesh);
  });

  // ==========================================================================
  // 3. SCULPTED DARK LOWER SIDE ROCKER SKIRTS, MIRRORS & UNDERBODY
  // ==========================================================================
  [-0.86, 0.86].forEach((sx) => {
    const sideSign = sx < 0 ? -1 : 1;
    const rockerCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sideSign * 0.85, 0.21, -0.84),
      new THREE.Vector3(sideSign * 0.81, 0.20, 0.0),
      new THREE.Vector3(sideSign * 0.86, 0.22, 0.82),
    ]);
    const rockerGeo = new THREE.TubeGeometry(rockerCurve, 16, 0.052, 8, false);
    rockerGeo.scale(0.55, 1.0, 1.0);
    const rockerMesh = new THREE.Mesh(rockerGeo, darkRockerMat);
    chassisGroup.add(rockerMesh);

    // Sleek Aerodynamic Side Mirrors on front door shoulders
    const mirrorGroup = new THREE.Group();
    mirrorGroup.position.set(sideSign * 0.81, 0.67, -0.64);
    const mirrorStalk = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.022, 0.052),
      darkRockerMat
    );
    const mirrorCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.050, 12, 10),
      bodyPaintMat
    );
    mirrorCap.scale.set(1.3, 0.62, 1.7);
    mirrorCap.position.set(sideSign * 0.055, 0.014, 0.02);
    mirrorGroup.add(mirrorStalk, mirrorCap);
    chassisGroup.add(mirrorGroup);

    // Flush Door Handle
    const handleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.020, 0.15),
      darkRockerMat
    );
    handleMesh.position.set(sideSign * 0.845, 0.55, 0.12);
    chassisGroup.add(handleMesh);
  });

  // Staggered Supercar Wheel Positions (Front & Rear precisely centered in the sculpted wheel arches)
  const wheelConfigs: { pos: [number, number, number]; scale: number }[] = [
    { pos: [-0.81, 0.295, -1.28], scale: 1.0 }, // Front Left
    { pos: [0.81, 0.295, -1.28], scale: 1.0 },  // Front Right
    { pos: [-0.84, 0.31, 1.24], scale: 1.05 },  // Rear Left (staggered wider/taller rear)
    { pos: [0.84, 0.31, 1.24], scale: 1.05 },   // Rear Right
  ];

  // Recessed Dark Inner Wheelhouse Liner (strictly inside the body & below the fender arch cutout)
  const wellLinerGeo = new THREE.CylinderGeometry(0.285, 0.285, 0.20, 24);
  wellLinerGeo.rotateZ(Math.PI / 2);

  wheelConfigs.forEach(({ pos: [wx, wy, wz], scale }) => {
    const isLeft = wx < 0;
    const wellLiner = new THREE.Mesh(wellLinerGeo, wheelWellBlackMat);
    wellLiner.scale.setScalar(scale);
    wellLiner.position.set(wx + (isLeft ? 0.08 : -0.08), wy, wz);
    chassisGroup.add(wellLiner);
  });

  // Metallic Underbody Floor Pan
  const underPanGeo = new THREE.BoxGeometry(1.26, 0.04, 3.68);
  const underPanMesh = new THREE.Mesh(underPanGeo, darkRockerMat);
  underPanMesh.position.set(0, 0.175, 0);
  chassisGroup.add(underPanMesh);

  // ==========================================================================
  // 4. FRONT AERO SPLITTER, HEADLIGHTS, REAR TESLA LIGHTBAR & DIFFUSER
  // ==========================================================================
  const frontSplitterCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.76, 0.20, -1.96),
    new THREE.Vector3(-0.45, 0.19, -2.16),
    new THREE.Vector3(0.0, 0.19, -2.22),
    new THREE.Vector3(0.45, 0.19, -2.16),
    new THREE.Vector3(0.76, 0.20, -1.96),
  ]);
  const frontSplitterGeo = new THREE.TubeGeometry(frontSplitterCurve, 24, 0.028, 8, false);
  frontSplitterGeo.scale(1, 0.5, 1.3);
  const frontSplitter = new THREE.Mesh(frontSplitterGeo, darkRockerMat);
  chassisGroup.add(frontSplitter);

  // Swept-Back LED Matrix Headlights
  [-1, 1].forEach((sideSign) => {
    const hlCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sideSign * 0.35, 0.38, -2.10),
      new THREE.Vector3(sideSign * 0.60, 0.43, -1.96),
      new THREE.Vector3(sideSign * 0.77, 0.48, -1.76),
    ]);
    const hlGeo = new THREE.TubeGeometry(hlCurve, 12, 0.021, 8, false);
    const hlMesh = new THREE.Mesh(hlGeo, headlightMat);
    chassisGroup.add(hlMesh);
  });

  // Recessed Dark Rear Fascia Panel & Signature Continuous Crimson LED Tailbar
  const rearFasciaRecess = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.20, 0.08),
    darkRockerMat
  );
  rearFasciaRecess.position.set(0, 0.50, 2.12);
  chassisGroup.add(rearFasciaRecess);

  const tailBarCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.80, 0.56, 2.04),
    new THREE.Vector3(-0.48, 0.58, 2.15),
    new THREE.Vector3(0.0, 0.59, 2.18),
    new THREE.Vector3(0.48, 0.58, 2.15),
    new THREE.Vector3(0.80, 0.56, 2.04),
  ]);
  const tailBarGeo = new THREE.TubeGeometry(tailBarCurve, 28, 0.023, 8, false);
  const tailBarMesh = new THREE.Mesh(tailBarGeo, taillightMat);
  chassisGroup.add(tailBarMesh);

  [-0.74, 0.74].forEach((rx) => {
    const cornerBrake = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.022, 0.06),
      taillightMat
    );
    cornerBrake.position.set(rx, 0.46, 2.09);
    chassisGroup.add(cornerBrake);
  });

  const rearDiffuserValance = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.14, 0.26),
    darkRockerMat
  );
  rearDiffuserValance.position.set(0, 0.25, 2.05);
  chassisGroup.add(rearDiffuserValance);

  [-0.50, -0.18, 0.18, 0.50].forEach((dx) => {
    const strake = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.15, 0.28),
      darkRockerMat
    );
    strake.position.set(dx, 0.24, 2.07);
    chassisGroup.add(strake);
  });

  // ==========================================================================
  // 5. FOUR PRECISION-FITTED AERO TURBINE SUPERCAR WHEELS
  // ==========================================================================
  const wheels: THREE.Group[] = [];

  // Rounded tire tread + shoulder torus for an authentic low-profile performance tire look
  const tireTreadGeo = new THREE.CylinderGeometry(0.288, 0.288, 0.175, 32);
  tireTreadGeo.rotateZ(Math.PI / 2);

  const tireShoulderGeo = new THREE.TorusGeometry(0.248, 0.042, 12, 32);
  tireShoulderGeo.rotateY(Math.PI / 2);

  // Brushed alloy outer rim lip ring
  const outerRimLipGeo = new THREE.TorusGeometry(0.212, 0.014, 10, 32);
  outerRimLipGeo.rotateY(Math.PI / 2);

  // Recessed satin-carbon aerodynamic disc cover
  const aeroCoverGeo = new THREE.CylinderGeometry(0.208, 0.208, 0.182, 28);
  aeroCoverGeo.rotateZ(Math.PI / 2);

  // Center lock metallic hub cap
  const centerHubGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.198, 18);
  centerHubGeo.rotateZ(Math.PI / 2);

  // Sculpted metallic turbine spokes on the outer face
  const spokeBladeGeo = new THREE.BoxGeometry(0.192, 0.022, 0.155);

  const tireRubberMat = new THREE.MeshStandardMaterial({
    color: 0x10131a,
    roughness: 0.65,
    metalness: 0.16,
  });

  wheelConfigs.forEach(({ pos: [wx, wy, wz], scale }, idx) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wx, wy, wz);
    wheelGroup.scale.setScalar(scale);

    const spinGroup = new THREE.Group();
    const tireTread = new THREE.Mesh(tireTreadGeo, tireRubberMat);
    const outerShoulder = new THREE.Mesh(tireShoulderGeo, tireRubberMat);
    const innerShoulder = new THREE.Mesh(tireShoulderGeo, tireRubberMat);
    outerShoulder.position.x = -0.052;
    innerShoulder.position.x = 0.052;

    const aeroCover = new THREE.Mesh(aeroCoverGeo, aeroWheelCoverMat);
    const centerHub = new THREE.Mesh(centerHubGeo, rimMetalMat);

    const outerX = idx % 2 === 0 ? -0.092 : 0.092;
    const rimLip = new THREE.Mesh(outerRimLipGeo, rimMetalMat);
    rimLip.position.x = outerX;

    // 5 directional turbine alloy spokes
    for (let s = 0; s < 5; s++) {
      const angle = (s / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(spokeBladeGeo, rimMetalMat);
      spoke.position.set(0, Math.cos(angle) * 0.105, Math.sin(angle) * 0.105);
      spoke.rotation.x = angle + 0.32;
      spinGroup.add(spoke);
    }

    spinGroup.add(tireTread, outerShoulder, innerShoulder, aeroCover, centerHub, rimLip);
    wheelGroup.add(spinGroup);
    chassisGroup.add(wheelGroup);
    wheels.push(wheelGroup);
  });

  // ==========================================================================
  // 6. FOUR UNDERSIDE VTOL JET THRUSTER NOZZLES + TAPERED PLASMA PLUMES
  // ==========================================================================
  const vtolNozzles: THREE.Group[] = [];
  const vtolPlumeGroups: THREE.Group[] = [];

  const plasmaCoreMat = createPlasmaJetShaderMaterial(
    0xffffff,
    initialSkin.thrusterCoreColor,
    initialSkin.thrusterColor,
    0.96
  );
  const plasmaMidMat = createPlasmaJetShaderMaterial(
    initialSkin.thrusterCoreColor,
    initialSkin.thrusterColor,
    0x6366f1,
    0.76
  );
  const plasmaOuterMat = createPlasmaJetShaderMaterial(
    initialSkin.thrusterColor,
    0xa855f7,
    0x3b82f6,
    0.45
  );

  const coreJetGeo = new THREE.CylinderGeometry(0.11, 0.015, 2.05, 18, 12, true);
  coreJetGeo.translate(0, -2.05 / 2, 0);

  const midJetGeo = new THREE.CylinderGeometry(0.17, 0.045, 2.35, 20, 12, true);
  midJetGeo.translate(0, -2.35 / 2, 0);

  const outerJetGeo = new THREE.CylinderGeometry(0.24, 0.09, 2.65, 20, 12, true);
  outerJetGeo.translate(0, -2.65 / 2, 0);

  const nozzleHousingGeo = new THREE.CylinderGeometry(0.24, 0.20, 0.12, 20);
  const nozzleApertureGeo = new THREE.CircleGeometry(0.17, 20);
  nozzleApertureGeo.rotateX(Math.PI / 2);

  const nozzleCoords: [number, number, number][] = [
    [-0.56, 0.20, -1.05], // Front-Left Underside Nozzle
    [0.56, 0.20, -1.05],  // Front-Right Underside Nozzle
    [-0.60, 0.20, 1.05],  // Rear-Left Underside Nozzle
    [0.60, 0.20, 1.05],   // Rear-Right Underside Nozzle
  ];

  nozzleCoords.forEach(([nx, ny, nz]) => {
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(nx, ny, nz);

    const housingMesh = new THREE.Mesh(nozzleHousingGeo, darkRockerMat);
    nozzleGroup.add(housingMesh);

    const apertureDisc = new THREE.Mesh(nozzleApertureGeo, nozzleApertureMat);
    apertureDisc.position.y = -0.062;
    nozzleGroup.add(apertureDisc);

    const plumeGroup = new THREE.Group();
    plumeGroup.position.y = -0.04;

    const coreMesh = new THREE.Mesh(coreJetGeo, plasmaCoreMat);
    const midMesh = new THREE.Mesh(midJetGeo, plasmaMidMat);
    const outerMesh = new THREE.Mesh(outerJetGeo, plasmaOuterMat);

    plumeGroup.add(coreMesh, midMesh, outerMesh);
    plumeGroup.visible = false;
    plumeGroup.scale.set(1, 0.01, 1);

    nozzleGroup.add(plumeGroup);
    chassisGroup.add(nozzleGroup);

    vtolNozzles.push(nozzleGroup);
    vtolPlumeGroups.push(plumeGroup);
  });

  // Ground Impingement Plasma Rings on the highway directly under the 4 nozzles
  const groundJetRings: THREE.Mesh[] = [];
  const impingeGeo = new THREE.PlaneGeometry(1.45, 1.45);
  impingeGeo.rotateX(-Math.PI / 2);
  const impingeMat = new THREE.MeshBasicMaterial({
    map: createJetImpingementTexture(),
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  nozzleCoords.forEach(([nx, , nz]) => {
    const ring = new THREE.Mesh(impingeGeo, impingeMat);
    ring.position.set(nx, 0.035, nz);
    ring.visible = false;
    root.add(ring);
    groundJetRings.push(ring);
  });

  // ==========================================================================
  // 7. TWIN REAR HORIZONTAL TURBO AFTERBURNER JETS
  // ==========================================================================
  const rearTurboPlumes: THREE.Group[] = [];
  const turboCoreGeo = new THREE.CylinderGeometry(0.10, 0.01, 1.65, 16, 8, true);
  turboCoreGeo.translate(0, -1.65 / 2, 0);
  turboCoreGeo.rotateX(-Math.PI / 2);

  const turboOuterGeo = new THREE.CylinderGeometry(0.16, 0.04, 2.05, 16, 8, true);
  turboOuterGeo.translate(0, -2.05 / 2, 0);
  turboOuterGeo.rotateX(-Math.PI / 2);

  [-0.44, 0.44].forEach((tx) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(tx, 0.30, 2.10);
    const tCore = new THREE.Mesh(turboCoreGeo, plasmaCoreMat);
    const tOuter = new THREE.Mesh(turboOuterGeo, plasmaMidMat);
    tGroup.add(tCore, tOuter);
    tGroup.visible = false;
    chassisGroup.add(tGroup);
    rearTurboPlumes.push(tGroup);
  });

  // ==========================================================================
  // 8. UNDERBODY LIGHT, SHIELD DOME, MAGNET RING & CONTACT SHADOW
  // ==========================================================================
  const underbodyLight = new THREE.PointLight(initialSkin.thrusterCoreColor, 1.4, 11, 1.4);
  underbodyLight.position.set(0, 0.12, 0);
  chassisGroup.add(underbodyLight);

  const shieldMesh = new THREE.Group();
  const shieldGeo = new THREE.IcosahedronGeometry(2.42, 2);
  const shieldFillMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shieldWireMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    wireframe: true,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shieldFill = new THREE.Mesh(shieldGeo, shieldFillMat);
  const shieldWire = new THREE.Mesh(shieldGeo, shieldWireMat);
  shieldFill.scale.set(0.58, 0.38, 1.05);
  shieldWire.scale.set(0.59, 0.39, 1.06);
  shieldMesh.add(shieldFill, shieldWire);
  shieldMesh.position.set(0, 0.52, 0);
  shieldMesh.visible = false;
  chassisGroup.add(shieldMesh);

  const magnetRingGeo = new THREE.RingGeometry(1.45, 1.62, 36);
  magnetRingGeo.rotateX(-Math.PI / 2);
  const magnetRingMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const magnetRingMesh = new THREE.Mesh(magnetRingGeo, magnetRingMat);
  magnetRingMesh.position.set(0, 0.25, 0);
  magnetRingMesh.visible = false;
  chassisGroup.add(magnetRingMesh);

  const shadowGeo = new THREE.PlaneGeometry(2.4, 4.7);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: createRadialShadowTexture(),
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.025, 0);
  root.add(contactShadow);

  // ==========================================================================
  // 9. SKIN UPDATER & FRAME KINEMATICS
  // ==========================================================================
  const applySkin = (skin: CarSkin) => {
    bodyPaintMat.color.setHex(skin.bodyColor);
    bodyPaintMat.metalness = skin.metalness;
    bodyPaintMat.roughness = skin.roughness;
    accentGlowMat.color.setHex(skin.accentColor);
    accentGlowMat.emissive.setHex(skin.accentColor);

    plasmaCoreMat.uniforms.uMidColor.value.setHex(skin.thrusterCoreColor);
    plasmaCoreMat.uniforms.uEdgeColor.value.setHex(skin.thrusterColor);
    plasmaMidMat.uniforms.uCoreColor.value.setHex(skin.thrusterCoreColor);
    plasmaMidMat.uniforms.uMidColor.value.setHex(skin.thrusterColor);
    plasmaOuterMat.uniforms.uCoreColor.value.setHex(skin.thrusterColor);
    underbodyLight.color.setHex(skin.thrusterCoreColor);
  };

  let vtolLengthFactor = 0;
  let landingBounceOffset = 0;
  let landingBounceVel = 0;

  const triggerLandingBounce = () => {
    landingBounceVel = -1.6;
  };

  const updateAnimation = (
    dt: number,
    elapsed: number,
    speed: number,
    flightState: FlightState,
    altitude: number,
    steerVelocity: number,
    isTurbo: boolean,
    hasShield: boolean,
    hasMagnet: boolean
  ) => {
    const isAirborne = flightState !== FlightState.GROUNDED || altitude > 0.06;

    plasmaCoreMat.uniforms.uTime.value = elapsed;
    plasmaMidMat.uniforms.uTime.value = elapsed;
    plasmaOuterMat.uniforms.uTime.value = elapsed;

    const jetIntensity = isTurbo ? 1.45 : flightState === FlightState.TAKING_OFF ? 1.3 : 1.05;
    plasmaCoreMat.uniforms.uIntensity.value = jetIntensity;
    plasmaMidMat.uniforms.uIntensity.value = jetIntensity;
    plasmaOuterMat.uniforms.uIntensity.value = jetIntensity;

    // 1. Wheel spin & subtle camber
    const wheelSpinSpeed = isAirborne ? speed * 0.55 : speed * 1.25;
    const targetWheelTilt = isAirborne ? 0.16 : 0;

    wheels.forEach((wheelGroup, idx) => {
      const spinGroup = wheelGroup.children[0];
      if (spinGroup) {
        spinGroup.rotation.x -= wheelSpinSpeed * dt;
      }
      const sign = idx % 2 === 0 ? 1 : -1;
      wheelGroup.rotation.z = THREE.MathUtils.damp(
        wheelGroup.rotation.z,
        sign * targetWheelTilt,
        9,
        dt
      );
    });

    // 2. Suspension & Hover Oscillation
    landingBounceVel += -landingBounceOffset * 65 * dt;
    landingBounceVel *= Math.exp(-9 * dt);
    landingBounceOffset += landingBounceVel * dt;

    const verticalWave = isAirborne
      ? Math.sin(elapsed * 4.6) * 0.065
      : Math.sin(elapsed * 26) * 0.01;

    chassisGroup.position.y = Math.max(0, altitude + verticalWave + landingBounceOffset);

    // 3. Banking Roll, Steering Yaw & Flight Pitch
    const clampedSteer = THREE.MathUtils.clamp(steerVelocity, -14, 14);
    const targetRoll = -clampedSteer * (isAirborne ? 0.022 : 0.014);
    const targetYaw = -clampedSteer * 0.011;

    let targetPitch = 0;
    if (flightState === FlightState.TAKING_OFF) {
      targetPitch = 0.115;
    } else if (flightState === FlightState.DESCENDING) {
      targetPitch = -0.095;
    } else if (flightState === FlightState.FLYING) {
      targetPitch = 0.018 + Math.sin(elapsed * 3.2) * 0.014;
    } else if (isTurbo) {
      targetPitch = 0.018;
    }

    chassisGroup.rotation.z = THREE.MathUtils.damp(chassisGroup.rotation.z, targetRoll, 11, dt);
    chassisGroup.rotation.y = THREE.MathUtils.damp(chassisGroup.rotation.y, targetYaw, 11, dt);
    chassisGroup.rotation.x = THREE.MathUtils.damp(chassisGroup.rotation.x, targetPitch, 8.5, dt);

    // 4. Four Underside VTOL Plasma Jet Plumes
    let desiredJetLen = 0;
    if (isAirborne) {
      if (flightState === FlightState.TAKING_OFF) {
        desiredJetLen = 1.18;
      } else if (flightState === FlightState.DESCENDING) {
        desiredJetLen = 0.48;
      } else {
        desiredJetLen = altitude > 3.2 ? 1.12 : 0.92;
      }
      if (isTurbo) desiredJetLen *= 1.22;
    }

    vtolLengthFactor = THREE.MathUtils.damp(vtolLengthFactor, desiredJetLen, 13, dt);
    const showJets = vtolLengthFactor > 0.03;

    vtolPlumeGroups.forEach((plumeGroup, i) => {
      plumeGroup.visible = showJets;
      if (showJets) {
        const MachFlutter = 0.92 + Math.sin(elapsed * 52 + i * 1.6) * 0.1;
        const widthScale = isTurbo ? 1.16 : 0.96;
        plumeGroup.rotation.x = -chassisGroup.rotation.x * 0.55;
        plumeGroup.scale.set(widthScale, vtolLengthFactor * MachFlutter, widthScale);
      }
    });

    groundJetRings.forEach((ring, i) => {
      ring.visible = showJets && altitude < 4.8;
      if (ring.visible) {
        const ringPulse = 0.85 + Math.sin(elapsed * 38 + i) * 0.15;
        const altAttenuation = Math.max(0.25, 1.0 - altitude * 0.16);
        ring.scale.setScalar(ringPulse * (0.75 + altitude * 0.18));
        impingeMat.opacity = 0.72 * altAttenuation * Math.min(1, vtolLengthFactor * 1.4);
      }
    });

    // 5. Rear Horizontal Turbo Afterburner Jets
    rearTurboPlumes.forEach((tGroup, idx) => {
      tGroup.visible = isTurbo;
      if (tGroup.visible) {
        const flicker = 1.25 * (0.88 + Math.sin(elapsed * 60 + idx * 2.1) * 0.16);
        tGroup.scale.set(1.1, 1.1, flicker);
      }
    });

    // 6. Underbody Light & Contact Shadow
    underbodyLight.intensity = isAirborne
      ? 5.2 * (0.9 + Math.sin(elapsed * 40) * 0.12)
      : isTurbo
      ? 3.6
      : 1.0;

    contactShadow.position.y = 0.025;
    const shadowScale = Math.max(0.5, 1 - altitude * 0.085);
    contactShadow.scale.set(shadowScale, 1, shadowScale);
    shadowMat.opacity = Math.max(0.2, 0.82 - altitude * 0.12);

    // 7. Deflector Shield & Magnet Field Ring
    shieldMesh.visible = hasShield;
    if (hasShield) {
      shieldWire.rotation.y += dt * 1.5;
      shieldWire.rotation.z += dt * 0.8;
    }

    magnetRingMesh.visible = hasMagnet;
    if (hasMagnet) {
      magnetRingMesh.rotation.z += dt * 3.0;
      const mScale = 1.0 + Math.sin(elapsed * 10) * 0.12;
      magnetRingMesh.scale.set(mScale, mScale, 1);
    }
  };

  return {
    root,
    chassisGroup,
    wheels,
    vtolNozzles,
    underbodyLight,
    shieldMesh,
    magnetRingMesh,
    contactShadow,
    groundJetRings,
    triggerLandingBounce,
    applySkin,
    updateAnimation,
  };
}
