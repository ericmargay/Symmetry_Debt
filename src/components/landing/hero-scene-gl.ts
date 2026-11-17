/**
 * The WebGL scene behind the landing hero: two hemispheres of fine points — one per side of a
 * debt — that drift towards each other and close into a single sphere. When they meet, the seam
 * between them lights up and, now and then, a small spark travels across it from one half to
 * the other: a payment the other side confirms.
 *
 * Plain three.js, no React. It is loaded on demand by `hero-scene.tsx`, so nothing here is on
 * the critical path of the page. Colours come from the page's CSS variables (see `HeroPalette`),
 * written as sRGB straight to the screen (no colour management) so they match the interface.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LinearSRGBColorSpace,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

export type RGB = readonly [number, number, number];

export interface HeroPalette {
  /** Teal of what both sides agreed on. */
  agreed: RGB;
  /** Slate of a personal, one-sided record. */
  personal: RGB;
  /** Amber of what is waiting for the other side. */
  waiting: RGB;
  /** Text colour, used sparingly for depth in light mode. */
  ink: RGB;
  dark: boolean;
}

export interface HeroSceneOptions {
  reducedMotion: boolean;
  /** Points on each hemisphere (the dust around them scales with it). */
  pointsPerHalf: number;
  onContextLost?: () => void;
}

export interface HeroScene {
  setPalette(palette: HeroPalette): void;
  setRunning(running: boolean): void;
  /** 0 → top of the hero, 1 → scrolled well into it. Brings the halves together. */
  setScroll(progress: number): void;
  /** Pointer position relative to the viewport centre, each axis in −1…1. */
  setPointer(x: number, y: number): void;
  /** While the visitor hovers (or taps) the illustration, the halves close completely. */
  setHover(hovering: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const RADIUS = 1.18;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ─── Shaders ───────────────────────────────────────────────────────────────────────────────

/** Soft round points; those on the far side of their sphere fade out, which gives the depth. */
const SHELL_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uBackFade;
  varying float vAlpha;
  varying float vTone;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 normal = normalize(normalMatrix * position);
    vAlpha = mix(uBackFade, 1.0, smoothstep(-0.55, 0.7, normal.z));
    vTone = fract(aSeed * 7.31);
    float twinkle = 0.84 + 0.16 * sin(uTime * 1.6 + aSeed * 61.0);
    gl_PointSize = uSize * uPixelRatio * (0.55 + 0.9 * aSeed) * twinkle * (7.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vTone;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    vec3 color = mix(uColorA, uColorB, step(0.88, vTone));
    gl_FragColor = vec4(color * a, a);
  }
`;

/** The rim of each half and the seam where they meet: a ring with two highlights travelling round. */
const RING_VERTEX = /* glsl */ `
  attribute float aAngle;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uSpeed;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 normal = normalize(normalMatrix * position);
    float facing = smoothstep(-0.7, 0.7, normal.z);
    float wave = pow(0.5 + 0.5 * cos(aAngle * 2.0 - uTime * uSpeed), 10.0);
    vAlpha = mix(0.3, 1.0, facing) * (0.38 + 0.62 * wave);
    gl_PointSize = uSize * uPixelRatio * (0.75 + 1.1 * wave) * (7.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = exp(-d * d * 22.0) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** Sparks: amber while on the side that sent them, teal once they cross the seam. */
const SPARK_VERTEX = /* glsl */ `
  attribute float aLife;
  attribute float aTrail;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float life = clamp(aLife, 0.0, 1.0);
    float crossing = smoothstep(-0.12, 0.12, position.x);
    vColor = mix(uFrom, uTo, crossing);
    float flash = 1.0 + 1.6 * exp(-position.x * position.x * 60.0);
    vAlpha = sin(3.14159 * life) * (1.0 - aTrail) * step(0.0, aLife) * step(aLife, 1.0);
    gl_PointSize = uSize * uPixelRatio * (1.0 - 0.75 * aTrail) * flash * (7.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = exp(-d * d * 18.0) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

// ─── Geometry ──────────────────────────────────────────────────────────────────────────────

/** Evenly spread points on one hemisphere (x < 0 for the left one, x > 0 for the right one). */
function hemisphere(count: number, side: -1 | 1, random: () => number): BufferGeometry {
  const total = count * 2;
  const positions: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < total; i += 1) {
    const y = 1 - ((i + 0.5) / total) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = GOLDEN_ANGLE * i;
    const x = Math.cos(theta) * ring;
    if (Math.sign(x) !== side) continue;
    const r = RADIUS * (1 + (random() - 0.5) * 0.035);
    positions.push(x * r, y * r, Math.sin(theta) * ring * r);
    seeds.push(random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aSeed", new BufferAttribute(new Float32Array(seeds), 1));
  return geometry;
}

/** A circle in the plane x = 0: the flat face of a half, or the seam of the whole. */
function ring(count: number, radius: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const angles = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    positions[i * 3] = 0;
    positions[i * 3 + 1] = Math.cos(angle) * radius;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    angles[i] = angle;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aAngle", new BufferAttribute(angles, 1));
  return geometry;
}

/** Faint dust in a shell around the sphere, for depth. */
function dust(count: number, random: () => number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const u = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const r = RADIUS * (1.3 + random() * 0.75);
    const ringRadius = Math.sqrt(1 - u * u);
    positions[i * 3] = Math.cos(theta) * ringRadius * r;
    positions[i * 3 + 1] = u * r * 0.82;
    positions[i * 3 + 2] = Math.sin(theta) * ringRadius * r;
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  return geometry;
}

/** Deterministic noise, so every visit draws the same sphere. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────────────────

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const mixRGB = (a: RGB, b: RGB, t: number, out: Vector3) => out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
const vec = (color: RGB) => new Vector3(color[0], color[1], color[2]);

function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/** A point on the unit sphere, on the requested side, away from the poles and the seam. */
function randomOnSide(side: -1 | 1, out: Vector3) {
  const theta = (Math.random() * 0.7 + 0.15) * Math.PI;
  const y = (Math.random() * 2 - 1) * 0.75;
  const ringRadius = Math.sqrt(1 - y * y);
  out.set(side * Math.abs(Math.sin(theta)) * ringRadius, y, Math.cos(theta) * ringRadius);
  return out.normalize();
}

/** Spherical interpolation between two unit vectors. */
function slerp(a: Vector3, b: Vector3, t: number, out: Vector3) {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const omega = Math.acos(dot);
  if (omega < 1e-4) return out.copy(a);
  const sin = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sin;
  const wb = Math.sin(t * omega) / sin;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}

// ─── Scene ─────────────────────────────────────────────────────────────────────────────────

const SPARKS = 3;
const TRAIL = 9;

interface Spark {
  from: Vector3;
  to: Vector3;
  life: number;
  speed: number;
}

/** Returns null when WebGL is not available, so the caller keeps its static fallback. */
export function createHeroScene(host: HTMLElement, initialPalette: HeroPalette, options: HeroSceneOptions): HeroScene | null {
  if (!webglAvailable()) return null;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0, 0, 7.2);

  const random = seededRandom(20261116);
  const pixelRatio = { value: Math.min(window.devicePixelRatio || 1, 2) };
  const time = { value: 0 };

  const shellMaterial = (size: number) =>
    new ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      uniforms: {
        uSize: { value: size },
        uPixelRatio: pixelRatio,
        uTime: time,
        uBackFade: { value: 0.14 },
        uColorA: { value: new Vector3() },
        uColorB: { value: new Vector3() },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
    });

  const ringMaterial = (size: number, speed: number) =>
    new ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      uniforms: {
        uSize: { value: size },
        uPixelRatio: pixelRatio,
        uTime: time,
        uSpeed: { value: speed },
        uColor: { value: new Vector3() },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
    });

  // Everything that turns with the pointer.
  const world = new Group();
  scene.add(world);

  const halves = ([-1, 1] as const).map((side) => {
    const pivot = new Group();
    const shell = new Points(hemisphere(options.pointsPerHalf, side, random), shellMaterial(3.1));
    const rim = new Points(ring(180, RADIUS * 1.005), ringMaterial(4.6, 0.7 * side));
    pivot.add(shell, rim);
    world.add(pivot);
    return { side, pivot, shell, rim };
  });

  const seam = new Points(ring(260, RADIUS * 1.02), ringMaterial(6.5, 1.15));
  world.add(seam);

  // Sparks: each one is a head plus a short trail of fading points.
  const sparkPositions = new Float32Array(SPARKS * TRAIL * 3);
  const sparkLife = new Float32Array(SPARKS * TRAIL).fill(-1);
  const sparkTrail = new Float32Array(SPARKS * TRAIL);
  for (let i = 0; i < SPARKS * TRAIL; i += 1) sparkTrail[i] = (i % TRAIL) / TRAIL;
  const sparkGeometry = new BufferGeometry();
  sparkGeometry.setAttribute("position", new BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute("aLife", new BufferAttribute(sparkLife, 1));
  sparkGeometry.setAttribute("aTrail", new BufferAttribute(sparkTrail, 1));
  const sparkMaterial = new ShaderMaterial({
    vertexShader: SPARK_VERTEX,
    fragmentShader: SPARK_FRAGMENT,
    uniforms: {
      uSize: { value: 6.5 },
      uPixelRatio: pixelRatio,
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3() },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
  });
  const sparkPoints = new Points(sparkGeometry, sparkMaterial);
  sparkPoints.frustumCulled = false;
  world.add(sparkPoints);
  const sparks: Spark[] = Array.from({ length: SPARKS }, () => ({ from: new Vector3(), to: new Vector3(), life: -1, speed: 0.5 }));

  // Dust turns on its own, more slowly than the sphere follows the pointer: parallax.
  const dustGroup = new Group();
  const dustPoints = new Points(dust(Math.round(options.pointsPerHalf / 4), random), shellMaterial(1.7));
  dustGroup.add(dustPoints);
  scene.add(dustGroup);

  const materials = [
    ...halves.flatMap(({ shell, rim }) => [shell.material, rim.material]),
    seam.material,
    sparkMaterial,
    dustPoints.material,
  ] as ShaderMaterial[];
  const geometries = [...halves.flatMap(({ shell, rim }) => [shell.geometry, rim.geometry]), seam.geometry, sparkGeometry, dustPoints.geometry];

  // ── State ──
  let palette = initialPalette;
  let running = false;
  let frame = 0;
  let last = 0;
  let elapsed = 0;
  let disposed = false;
  let progress = options.reducedMotion ? 1 : 0;
  let scroll = 0;
  let hover = false;
  let pointerX = 0;
  let pointerY = 0;
  let tiltX = 0;
  let tiltY = 0;
  let joined = options.reducedMotion;
  let flash = 0;
  let nextSpark = 1.2;
  const scratch = new Vector3();
  const leftColor = new Vector3();

  function applyPalette() {
    const { agreed, personal, waiting, ink, dark } = palette;
    const blending = dark ? AdditiveBlending : NormalBlending;
    for (const material of materials) {
      if (material.blending !== blending) {
        material.blending = blending;
        material.needsUpdate = true;
      }
    }
    // A few points in a second tone give the shell texture: lighter in the dark, deeper on paper.
    const highlight: RGB = dark
      ? [Math.min(1, agreed[0] + 0.35), Math.min(1, agreed[1] + 0.3), Math.min(1, agreed[2] + 0.3)]
      : [agreed[0] * 0.45 + ink[0] * 0.55, agreed[1] * 0.45 + ink[1] * 0.55, agreed[2] * 0.45 + ink[2] * 0.55];
    for (const { shell, rim } of halves) {
      const shellUniforms = (shell.material as ShaderMaterial).uniforms;
      shellUniforms.uBackFade.value = dark ? 0.08 : 0.12;
      shellUniforms.uColorB.value.copy(vec(highlight));
      shellUniforms.uOpacity.value = dark ? 0.78 : 1;
      (rim.material as ShaderMaterial).uniforms.uColor.value.copy(vec(agreed));
    }
    (seam.material as ShaderMaterial).uniforms.uColor.value.copy(vec(dark ? highlight : agreed));
    sparkMaterial.uniforms.uFrom.value.copy(vec(waiting));
    sparkMaterial.uniforms.uTo.value.copy(vec(dark ? highlight : agreed));
    const dustUniforms = (dustPoints.material as ShaderMaterial).uniforms;
    dustUniforms.uColorA.value.copy(vec(personal));
    dustUniforms.uColorB.value.copy(vec(agreed));
    dustUniforms.uOpacity.value = dark ? 0.32 : 0.4;
    dustUniforms.uBackFade.value = 0.35;
  }

  function spawnSpark() {
    const spark = sparks.find((candidate) => candidate.life < 0 || candidate.life > 1);
    if (!spark) return;
    // Payments go both ways: each side confirms what the other one recorded.
    const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    randomOnSide(side, spark.from);
    randomOnSide(side === -1 ? 1 : -1, spark.to);
    spark.life = 0;
    spark.speed = 0.42 + Math.random() * 0.16;
  }

  function updateSparks(dt: number) {
    for (let s = 0; s < SPARKS; s += 1) {
      const spark = sparks[s];
      if (spark.life >= 0 && spark.life <= 1) spark.life += dt * spark.speed;
      for (let k = 0; k < TRAIL; k += 1) {
        const index = s * TRAIL + k;
        const t = spark.life - k * 0.018;
        sparkLife[index] = spark.life < 0 || spark.life > 1 ? -1 : t;
        if (sparkLife[index] < 0) continue;
        slerp(spark.from, spark.to, Math.min(1, t), scratch);
        const lift = RADIUS * (1.03 + 0.2 * Math.sin(Math.PI * Math.min(1, t)));
        sparkPositions[index * 3] = scratch.x * lift;
        sparkPositions[index * 3 + 1] = scratch.y * lift;
        sparkPositions[index * 3 + 2] = scratch.z * lift;
      }
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkGeometry.attributes.aLife.needsUpdate = true;
  }

  function update(dt: number) {
    elapsed += dt;
    time.value = elapsed;

    if (!options.reducedMotion) {
      const intro = easeOutCubic(clamp01((elapsed - 0.15) / 2.6)) * 0.56;
      const target = clamp01(intro + scroll * (1 - intro) + (hover ? 0.46 : 0));
      progress = damp(progress, target, hover ? 3.2 : 2.2, dt);
    }

    if (!joined && progress > 0.985) {
      joined = true;
      flash = 1;
    } else if (joined && progress < 0.9) {
      joined = false;
    }
    flash *= Math.exp(-dt * 1.4);

    const open = 1 - progress;
    for (const { side, pivot, shell, rim } of halves) {
      pivot.position.x = side * open ** 1.15 * 0.6;
      pivot.rotation.y = -side * open * 0.62;
      if (!options.reducedMotion) shell.rotation.x += dt * 0.09 * side;
      const shellUniforms = (shell.material as ShaderMaterial).uniforms;
      if (side === -1) {
        // The left half is a personal record until both sides agree.
        mixRGB(palette.personal, palette.agreed, smoothstep(0.62, 1, progress), leftColor);
        shellUniforms.uColorA.value.copy(leftColor);
      } else {
        shellUniforms.uColorA.value.copy(vec(palette.agreed));
      }
      (rim.material as ShaderMaterial).uniforms.uOpacity.value = 0.35 + 0.4 * progress;
    }
    (seam.material as ShaderMaterial).uniforms.uOpacity.value = smoothstep(0.8, 1, progress) * 0.8 + flash * 0.9;

    // Payments only travel once there is an agreement.
    if (!options.reducedMotion) {
      nextSpark -= dt;
      if (nextSpark <= 0) {
        if (progress > 0.82) spawnSpark();
        nextSpark = 1.6 + Math.random() * 1.6;
      }
      updateSparks(dt);
    }
    sparkMaterial.uniforms.uOpacity.value = smoothstep(0.7, 0.95, progress);

    tiltX = damp(tiltX, pointerX, 2.5, dt);
    tiltY = damp(tiltY, pointerY, 2.5, dt);
    world.rotation.set(0.2 + tiltY * 0.16, -0.5 + tiltX * 0.3, 0.04);
    dustGroup.rotation.set(0.1 + tiltY * 0.07, elapsed * 0.025 + tiltX * 0.12, 0);
  }

  function render() {
    renderer.render(scene, camera);
  }

  function loop(now: number) {
    if (!running || disposed) return;
    frame = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    render();
  }

  /** A single still frame: the joined sphere, for reduced motion, or after a resize while paused. */
  function renderStill() {
    if (disposed) return;
    update(0);
    render();
  }

  const onContextLost = (event: Event) => {
    event.preventDefault();
    running = false;
    cancelAnimationFrame(frame);
    options.onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  applyPalette();

  return {
    setPalette(next) {
      palette = next;
      applyPalette();
      if (!running) renderStill();
    },
    setRunning(next) {
      if (disposed || options.reducedMotion) return;
      if (next && !running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(loop);
      } else if (!next && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    },
    setScroll(value) {
      scroll = clamp01(value);
    },
    setPointer(x, y) {
      pointerX = Math.max(-1, Math.min(1, x));
      pointerY = Math.max(-1, Math.min(1, y));
    },
    setHover(value) {
      hover = value;
    },
    resize(width, height) {
      if (disposed || width === 0 || height === 0) return;
      pixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio.value);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Keep the whole sphere in frame when the box is taller than it is wide.
      camera.position.z = 7.2 * Math.max(1, 1 / camera.aspect);
      camera.updateProjectionMatrix();
      if (!running) renderStill();
    },
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
