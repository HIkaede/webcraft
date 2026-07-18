/**
 * Panorama —— 标题画面全景背景（home.md §背景）。
 *
 * 脚手架版实现（自包含 three.js）：
 * 1. 冷启动：用固定种子 1099511627 生成一个小体素世界（64×64 列、simplex 地形、树/水/云/太阳/天穹），
 *    以 CubeCamera 渲染 6 张 512² 立方体贴图；
 * 2. 之后每帧只渲染该立方体背景（极省性能），CSS blur(1.5px) 近似原版 rotateAndBlurSkybox；
 * 3. 运动：yaw 2°/s（180s 一圈）、pitch = sin(t/125s)·25° + 20°、FOV 120；
 *    减少动态效果（设置或 prefers-reduced-motion）→ 静止在 yaw=0、pitch=20°；
 * 4. WebGL 初始化/渲染失败 → onFallback()，由调用方降级为静态泥土背景 + 渐变罩（home.md §背景）。
 *
 * ⚠️ design.md §1 架构要点：最终应复用全局 GameCanvas 的单一 WebGLRenderer。
 * 引擎代理接入时请用共享 renderer 重写本组件（对外 props 契约保持不变）。
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { useSettingsStore } from '@/stores/settings';

export interface PanoramaProps {
  /** WebGL 不可用时回调（调用方显示泥土背景降级） */
  onFallback?: () => void;
  className?: string;
}

/* ---------------- 确定性随机 ---------------- */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 程序纹理（game.md §3 配方的简化版） ---------------- */
const TILE = 16;
const TILES = [
  'grass_top',
  'grass_side',
  'dirt',
  'stone',
  'sand',
  'water',
  'log_side',
  'log_top',
  'leaves'
] as const;
type TileName = (typeof TILES)[number];
const TILE_INDEX = Object.fromEntries(TILES.map((t, i) => [t, i])) as Record<TileName, number>;

function hex(h: string): [number, number, number] {
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  index: number,
  base: string,
  jitter: number,
  rng: () => number
) {
  const [r, g, b] = hex(base);
  const ox = index * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const j = 1 + (rng() - 0.5) * jitter;
      ctx.fillStyle = `rgb(${Math.min(255, r * j) | 0},${Math.min(255, g * j) | 0},${Math.min(255, b * j) | 0})`;
      ctx.fillRect(ox + x, y, 1, 1);
    }
  }
}

function buildAtlas(rng: () => number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * TILES.length;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  paintTile(ctx, TILE_INDEX.grass_top, '7FBF54', 0.26, rng);
  paintTile(ctx, TILE_INDEX.dirt, '866043', 0.36, rng);
  // grass_side = dirt + 顶部绿裙边（每列向下 1–3px）
  ctx.drawImage(
    canvas,
    TILE_INDEX.dirt * TILE,
    0,
    TILE,
    TILE,
    TILE_INDEX.grass_side * TILE,
    0,
    TILE,
    TILE
  );
  for (let x = 0; x < TILE; x++) {
    const depth = 2 + Math.floor(rng() * 3);
    for (let y = 0; y < depth; y++) {
      const j = 1 + (rng() - 0.5) * 0.2;
      const [r, g, b] = hex('7FBF54');
      ctx.fillStyle = `rgb(${(r * j) | 0},${(g * j) | 0},${(b * j) | 0})`;
      ctx.fillRect(TILE_INDEX.grass_side * TILE + x, y, 1, 1);
    }
  }
  paintTile(ctx, TILE_INDEX.stone, '7D7D7D', 0.2, rng);
  paintTile(ctx, TILE_INDEX.sand, 'DBD3A0', 0.2, rng);
  paintTile(ctx, TILE_INDEX.water, '3F76E4', 0.12, rng);
  // water 横向流线
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(TILE_INDEX.water * TILE + 2, 4, 10, 1);
  ctx.fillRect(TILE_INDEX.water * TILE + 5, 11, 9, 1);
  paintTile(ctx, TILE_INDEX.log_side, '6B5230', 0.2, rng);
  for (let x = 1; x < TILE; x += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(TILE_INDEX.log_side * TILE + x, 0, 1, TILE);
  }
  paintTile(ctx, TILE_INDEX.log_top, '9C8050', 0.15, rng);
  ctx.strokeStyle = 'rgba(107,82,48,0.9)';
  for (let i = 2; i < 8; i += 2) {
    ctx.strokeRect(TILE_INDEX.log_top * TILE + i, i, TILE - i * 2, TILE - i * 2);
  }
  paintTile(ctx, TILE_INDEX.leaves, '3E8F35', 0.5, rng);
  return canvas;
}

/* ---------------- 体素世界（简化版，仅为全景服务） ---------------- */
const WORLD_R = 32; // x,z ∈ [-32, 31]
const WORLD_H = 40;
const WATER_Y = 11;
const PANORAMA_SEED = 1099511627;

const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7 } as const;

function buildWorld(): Uint8Array {
  const world = new Uint8Array(64 * WORLD_H * 64);
  const rng = mulberry32(PANORAMA_SEED);
  const noise = createNoise2D(rng);
  const at = (x: number, y: number, z: number) => x + WORLD_R + (z + WORLD_R) * 64 + y * 64 * 64;
  const heightAt = (x: number, z: number) => {
    const c = noise(x / 38, z / 38) * 5;
    const d = noise(x / 11 + 91, z / 11 - 47) * 2.2;
    return Math.max(3, Math.min(22, Math.round(10 + c + d)));
  };
  const treeRng = mulberry32(PANORAMA_SEED ^ 0x5f3759df);
  for (let x = -WORLD_R; x < WORLD_R; x++) {
    for (let z = -WORLD_R; z < WORLD_R; z++) {
      const h = heightAt(x, z);
      const beach = h <= WATER_Y + 1;
      for (let y = 0; y <= h; y++) {
        let id: number = B.STONE;
        if (y === h) id = beach ? B.SAND : B.GRASS;
        else if (y >= h - 3) id = beach ? B.SAND : B.DIRT;
        world[at(x, y, z)] = id;
      }
      if (h < WATER_Y) for (let y = h + 1; y <= WATER_Y; y++) world[at(x, y, z)] = B.WATER;
      // 树（少量，确定性）
      if (
        !beach &&
        h > WATER_Y + 1 &&
        treeRng() < 0.022 &&
        Math.abs(x) < WORLD_R - 3 &&
        Math.abs(z) < WORLD_R - 3
      ) {
        const trunk = 4;
        for (let y = h + 1; y <= h + trunk; y++) world[at(x, y, z)] = B.LOG;
        for (let dy = 0; dy < 2; dy++) {
          const r = dy === 0 ? 2 : 1;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (dx === 0 && dz === 0 && dy === 0) continue;
              if (Math.abs(dx) === r && Math.abs(dz) === r && treeRng() < 0.5) continue;
              const y = h + trunk - 1 + dy;
              if (world[at(x + dx, y, z + dz)] === 0) world[at(x + dx, y, z + dz)] = B.LEAVES;
            }
          }
        }
      }
    }
  }
  return world;
}

/* ---------------- 网格化（仅暴露面，顶点色烘焙面朝向明暗） ---------------- */
function buildWorldMesh(world: Uint8Array, atlasTex: THREE.Texture): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const at = (x: number, y: number, z: number) => x + WORLD_R + (z + WORLD_R) * 64 + y * 64 * 64;
  const get = (x: number, y: number, z: number): number => {
    if (y < 0 || y >= WORLD_H || Math.abs(x) > WORLD_R || Math.abs(z) > WORLD_R) return 0;
    return world[at(x, y, z)];
  };
  const solid = (id: number) => id !== 0 && id !== B.WATER;

  const FACE_TILE: Record<number, [TileName, TileName, TileName]> = {
    [B.GRASS]: ['grass_top', 'grass_side', 'dirt'],
    [B.DIRT]: ['dirt', 'dirt', 'dirt'],
    [B.STONE]: ['stone', 'stone', 'stone'],
    [B.SAND]: ['sand', 'sand', 'sand'],
    [B.WATER]: ['water', 'water', 'water'],
    [B.LOG]: ['log_top', 'log_side', 'log_top'],
    [B.LEAVES]: ['leaves', 'leaves', 'leaves']
  };
  // face: dir, corners(4×3, 逆时针朝外), shade, kind(0=top,1=side,2=bottom)
  const FACES: {
    dir: [number, number, number];
    corners: [number, number, number][];
    shade: number;
    kind: 0 | 1 | 2;
  }[] = [
    {
      dir: [0, 1, 0],
      corners: [
        [0, 1, 0],
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0]
      ],
      shade: 1.0,
      kind: 0
    },
    {
      dir: [0, -1, 0],
      corners: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1]
      ],
      shade: 0.5,
      kind: 2
    },
    {
      dir: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1]
      ],
      shade: 0.6,
      kind: 1
    },
    {
      dir: [-1, 0, 0],
      corners: [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0]
      ],
      shade: 0.6,
      kind: 1
    },
    {
      dir: [0, 0, 1],
      corners: [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1]
      ],
      shade: 0.8,
      kind: 1
    },
    {
      dir: [0, 0, -1],
      corners: [
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0]
      ],
      shade: 0.8,
      kind: 1
    }
  ];
  const nTiles = TILES.length;
  for (let x = -WORLD_R; x < WORLD_R; x++) {
    for (let z = -WORLD_R; z < WORLD_R; z++) {
      for (let y = 0; y < WORLD_H; y++) {
        const id = get(x, y, z);
        if (id === 0) continue;
        const tiles = FACE_TILE[id];
        if (!tiles) continue;
        for (const face of FACES) {
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          const nid = get(nx, ny, nz);
          // 水只画顶面；固体面对空气/水暴露才画
          if (id === B.WATER && face.kind !== 0) continue;
          if (solid(nid)) continue;
          if (id === B.WATER && nid === B.WATER) continue;
          const tile = TILE_INDEX[tiles[face.kind]];
          const u0 = tile / nTiles;
          const u1 = (tile + 1) / nTiles;
          const base = positions.length / 3;
          const uvQuad: [number, number][] = [
            [u0, 0],
            [u0, 1],
            [u1, 1],
            [u1, 0]
          ];
          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            uvs.push(uvQuad[c][0], uvQuad[c][1]);
            colors.push(face.shade, face.shade, face.shade);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
  return new THREE.Mesh(geo, mat);
}

/** 天穹（顶点色渐变：天顶深、地平线浅）+ 太阳 + 云 */
function buildSky(): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(600, 600, 600);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const top = hex('6A96F0');
  const horizon = hex('C0D8FF');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) + 300) / 600));
    const c = [
      horizon[0] + (top[0] - horizon[0]) * t,
      horizon[1] + (top[1] - horizon[1]) * t,
      horizon[2] + (top[2] - horizon[2]) * t
    ];
    colors[i * 3] = c[0] / 255;
    colors[i * 3 + 1] = c[1] / 255;
    colors[i * 3 + 2] = c[2] / 255;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
  );
  group.add(sky);

  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 46),
    new THREE.MeshBasicMaterial({ color: 0xffffd8, fog: false })
  );
  sun.position.set(220, 90, 0);
  sun.lookAt(0, 20, 0);
  group.add(sun);

  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    fog: false
  });
  const cloudRng = mulberry32(PANORAMA_SEED ^ 0x1234);
  for (let i = 0; i < 12; i++) {
    const w = 14 + cloudRng() * 22;
    const cloud = new THREE.Mesh(
      new THREE.BoxGeometry(w, 2, w * (0.6 + cloudRng() * 0.8)),
      cloudMat
    );
    cloud.position.set((cloudRng() - 0.5) * 160, 42 + cloudRng() * 4, (cloudRng() - 0.5) * 160);
    group.add(cloud);
  }
  return group;
}

/* ---------------- 组件 ---------------- */

export default function Panorama({ onFallback, className }: PanoramaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef(onFallback);

  useEffect(() => {
    fallbackRef.current = onFallback;
  }, [onFallback]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: 'low-power'
      });
    } catch {
      fallbackRef.current?.();
      return;
    }

    try {
      const rng = mulberry32(PANORAMA_SEED);
      // 图集纹理（NearestFilter、无 mipmap，design.md §14）
      const atlasTex = new THREE.CanvasTexture(buildAtlas(rng));
      atlasTex.magFilter = THREE.NearestFilter;
      atlasTex.minFilter = THREE.NearestFilter;
      atlasTex.generateMipmaps = false;
      atlasTex.colorSpace = THREE.SRGBColorSpace;

      // 小世界场景 → 立方体贴图（冷启动渲染一次）
      const worldScene = new THREE.Scene();
      const worldMesh = buildWorldMesh(buildWorld(), atlasTex);
      worldScene.add(worldMesh);
      worldScene.add(buildSky());
      const cubeRT = new THREE.WebGLCubeRenderTarget(512);
      const cubeCamera = new THREE.CubeCamera(0.5, 800, cubeRT);
      cubeCamera.position.set(0.5, 24, 0.5);
      cubeCamera.update(renderer, worldScene);

      // 展示场景：仅立方体背景
      const scene = new THREE.Scene();
      scene.background = cubeRT.texture;
      const camera = new THREE.PerspectiveCamera(120, 1, 0.05, 1000);
      camera.rotation.order = 'YXZ';

      const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', resize);

      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const t0 = performance.now();
      const loop = () => {
        if (disposed) return;
        const t = (performance.now() - t0) / 1000;
        const reduced = mq.matches || useSettingsStore.getState().reducedMotion;
        const yawDeg = reduced ? 0 : t * 2; // 2°/s，180s 一圈
        const pitchDeg = reduced ? 20 : Math.sin(t / 125) * 25 + 20;
        camera.rotation.y = THREE.MathUtils.degToRad(yawDeg);
        camera.rotation.x = THREE.MathUtils.degToRad(-pitchDeg);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const onLost = (e: Event) => {
        e.preventDefault();
        fallbackRef.current?.();
      };
      canvas.addEventListener('webglcontextlost', onLost);

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('webglcontextlost', onLost);
        worldMesh.geometry.dispose();
        (worldMesh.material as THREE.Material).dispose();
        atlasTex.dispose();
        cubeRT.dispose();
        renderer.dispose();
      };
    } catch (e) {
      console.warn('[Panorama] WebGL 初始化失败，降级为泥土背景', e);
      renderer.dispose();
      fallbackRef.current?.();
    }
  }, []);

  return (
    <div className={className} style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          filter: 'blur(1.5px)' // 近似原版 rotateAndBlurSkybox 的轻微模糊
        }}
      />
      {/* 原版渐变罩：顶白 → 透明（30%），底 透明 → 黑 0.5（70%） */}
      <div className="mc-title-vignette-top pointer-events-none absolute inset-0" />
      <div className="mc-title-vignette-bottom pointer-events-none absolute inset-0" />
    </div>
  );
}
