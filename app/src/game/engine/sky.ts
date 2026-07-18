/**
 * 天空与昼夜（game.md §2.2 + design.md §3.2）。
 *
 * - 周期 1200s = 24000 tick：日出 0、正午 6000、日落 12000、午夜 18000
 * - 太阳/月亮 60×60 方形 billboard 沿东西轨道（相距 180°）
 * - 天空色按太阳高度角在三态色板间 smoothstep 混合；大半径渐变穹顶（天顶深、地平线浅 15%）
 * - 星星 1500 个 Points（θ<−10° 可见，透明度随夜深度，随机闪烁）
 * - 云：InstancedMesh 12×12×4 白色半透明盒，y=118，+x 漂移 1.2 m/s，可关
 * - 雾：Fog((rd−1.5)*16, rd*16)，雾色随天空色同步；水下浓雾
 */
import * as THREE from 'three';
import { hash2, lerp, clamp, smoothstep } from './rng';

/* 三态色板（design.md §3.2） */
const DAY_SKY = new THREE.Color(0x78a7ff);
const DAY_FOG = new THREE.Color(0xc0d8ff);
const DUSK_SKY = new THREE.Color(0xe8875a);
const DUSK_TOP = new THREE.Color(0x5a6fbf);
const DUSK_FOG = new THREE.Color(0xd8a078);
const NIGHT_SKY = new THREE.Color(0x050510);
const NIGHT_FOG = new THREE.Color(0x0a0a1e);
const SUN_COLOR = new THREE.Color(0xffffd8);
const SUNSET_SUN = new THREE.Color(0xffb070);
const MOON_COLOR = new THREE.Color(0xd8e0ff);

function makeDiscTexture(spots: boolean): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 32, 32);
  if (spots) {
    // 月相灰斑（程序贴图）
    ctx.fillStyle = 'rgba(120,130,160,0.55)';
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(hash2(i, 3, 999) * 26) + 2;
      const y = Math.floor(hash2(i, 7, 999) * 26) + 2;
      const s = 2 + Math.floor(hash2(i, 11, 999) * 5);
      ctx.fillRect(x, y, s, s);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export class Sky {
  readonly group = new THREE.Group();
  readonly sunLight = new THREE.DirectionalLight(0xfff8e7, 1.0);
  readonly ambient = new THREE.AmbientLight(0xffffff, 0.65);
  /** 日照系数（0.15–1.0），供体素材质 uniform 使用 */
  readonly sunFactor = { value: 1.0 };
  readonly skyColor = new THREE.Color();
  readonly fogColor = new THREE.Color();

  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly starGeo: THREE.BufferGeometry;
  private readonly clouds: THREE.InstancedMesh;
  private cloudsVisible = true;
  private cloudOffset = 0;
  private readonly starPhases: Float32Array;
  private readonly starSpeeds: Float32Array;
  private starTime = 0;

  private readonly renderDistance: number;

  constructor(renderDistance: number) {
    this.renderDistance = renderDistance;
    // 渐变穹顶（顶点色：天顶深、地平线浅 15%）
    const domeGeo = new THREE.SphereGeometry(420, 24, 12);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x78a7ff) },
        bottomColor: { value: new THREE.Color(0xc0d8ff) }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.6 + 0.25, 0.0, 1.0);
          vec3 c = mix(bottomColor, topColor, pow(h, 0.75));
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // 太阳 / 月亮
    const sunMat = new THREE.MeshBasicMaterial({
      map: makeDiscTexture(false),
      color: SUN_COLOR,
      fog: false,
      transparent: true
    });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sunMat);
    const moonMat = new THREE.MeshBasicMaterial({
      map: makeDiscTexture(true),
      color: MOON_COLOR,
      fog: false,
      transparent: true
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), moonMat);
    this.group.add(this.sun, this.moon);

    // 星星：1500 个随机半球点
    const starCount = 1500;
    const pos = new Float32Array(starCount * 3);
    this.starPhases = new Float32Array(starCount);
    this.starSpeeds = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      // 均匀半球
      const u = hash2(i, 1, 31337);
      const v = hash2(i, 2, 31337);
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v); // 0..π/2 半球
      const r = 400;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] =
        r * Math.cos(phi) * (hash2(i, 5, 31337) < 0.5 ? 1 : -1) * 0.3 + r * Math.cos(phi) * 0.7;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      this.starPhases[i] = hash2(i, 3, 31337) * Math.PI * 2;
      this.starSpeeds[i] = (Math.PI * 2) / (2 + hash2(i, 4, 31337) * 3); // 2–5s 闪烁
    }
    this.starGeo = new THREE.BufferGeometry();
    this.starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false
    });
    this.stars = new THREE.Points(this.starGeo, starMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // 云：InstancedMesh 12×12×4 白色半透明盒，铺 y=118
    const cloudCount = Math.max(16, Math.floor(renderDistance * renderDistance * 0.7));
    const cloudGeo = new THREE.BoxGeometry(12, 4, 12);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      fog: false
    });
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);

    this.sunLight.castShadow = false;
    this.group.add(this.sunLight, this.sunLight.target, this.ambient);
  }

  setCloudsVisible(v: boolean): void {
    this.cloudsVisible = v;
    this.clouds.visible = v;
  }

  /**
   * 每帧更新。
   * @param ticks 世界时间 0–23999
   * @param camPos 相机位置（穹顶/天体跟随）
   * @param dt 帧间隔秒
   */
  update(ticks: number, camPos: THREE.Vector3, dt: number): void {
    // 太阳轨道角：t=0 日出（东地平线），t=6000 正午
    const a = (ticks / 24000) * Math.PI * 2;
    const elevation = Math.sin(a); // 1 = 正午, -1 = 午夜
    const R = 300;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    this.sun.position.copy(camPos).addScaledVector(sunDir, R);
    this.sun.lookAt(camPos);
    this.moon.position.copy(camPos).addScaledVector(sunDir, -R);
    this.moon.lookAt(camPos);
    this.dome.position.copy(camPos);
    this.stars.position.copy(camPos);

    // 天空色三态混合（太阳高度角 ±30° 过渡带 smoothstep）
    const dayW = smoothstep(0.12, 0.35, elevation);
    const nightW = 1 - smoothstep(-0.35, -0.12, elevation);
    const duskW = Math.max(0, 1 - dayW - nightW);
    this.skyColor.setRGB(
      DAY_SKY.r * dayW + DUSK_SKY.r * duskW + NIGHT_SKY.r * nightW,
      DAY_SKY.g * dayW + DUSK_SKY.g * duskW + NIGHT_SKY.g * nightW,
      DAY_SKY.b * dayW + DUSK_SKY.b * duskW + NIGHT_SKY.b * nightW
    );
    this.fogColor.setRGB(
      DAY_FOG.r * dayW + DUSK_FOG.r * duskW + NIGHT_FOG.r * nightW,
      DAY_FOG.g * dayW + DUSK_FOG.g * duskW + NIGHT_FOG.g * nightW,
      DAY_FOG.b * dayW + DUSK_FOG.b * duskW + NIGHT_FOG.b * nightW
    );

    // 穹顶：天顶深、地平线浅 15%
    const domeMat = this.dome.material;
    (domeMat.uniforms.bottomColor.value as THREE.Color)
      .copy(this.skyColor)
      .lerp(this.fogColor, 0.5);
    (domeMat.uniforms.topColor.value as THREE.Color).copy(this.skyColor).multiplyScalar(0.85);
    if (duskW > 0.4) {
      // 黄昏顶部偏蓝
      (domeMat.uniforms.topColor.value as THREE.Color).lerp(DUSK_TOP, (duskW - 0.4) * 0.9);
    }

    // 日照系数（供体素 shader）：夜 0.18 → 昼 1.0
    this.sunFactor.value = lerp(0.18, 1.0, dayW);
    // 直射光与环境光（design.md §3.2）
    this.sunLight.intensity = lerp(0.25, 1.0, dayW);
    this.sunLight.color.copy(new THREE.Color(0xfff8e7)).lerp(new THREE.Color(0xffb070), duskW);
    if (nightW > 0.5) this.sunLight.color.set(0x8899ff);
    this.sunLight.position.copy(camPos).addScaledVector(sunDir, 100);
    this.sunLight.target.position.copy(camPos);
    this.ambient.intensity = lerp(0.22, 0.65, dayW);

    // 太阳颜色：日落橙色调
    (this.sun.material as THREE.MeshBasicMaterial).color
      .copy(SUN_COLOR)
      .lerp(SUNSET_SUN, clamp(duskW * 1.2, 0, 1));

    // 星星：θ<−10° 可见，透明度随夜深度 0→0.9，随机闪烁
    const nightDepth = smoothstep(0.17, 0.5, -elevation);
    this.starTime += dt;
    const starMat = this.stars.material as THREE.PointsMaterial;
    starMat.opacity = nightDepth * 0.9;
    if (nightDepth > 0) {
      // 闪烁：整体透明度微调 + 星场缓慢旋转（代替逐星更新，零分配）
      this.stars.rotation.y += dt * 0.004;
      starMat.opacity = nightDepth * (0.75 + 0.15 * Math.sin(this.starTime * 2.1));
    }

    // 云：+x 漂移 1.2 m/s，512m 环绕
    if (this.cloudsVisible) {
      this.cloudOffset = (this.cloudOffset + dt * 1.2) % 512;
      const span = Math.max(8, this.renderDistance) * 16 * 2;
      const gridN = Math.ceil(Math.sqrt(this.clouds.count));
      const cell = span / gridN;
      const m = new THREE.Matrix4();
      let n = 0;
      for (let gz = 0; gz < gridN && n < this.clouds.count; gz++)
        for (let gx = 0; gx < gridN && n < this.clouds.count; gx++) {
          if (hash2(gx, gz, 4242) > 0.55) continue; // 按 hash 图案排布
          let px = gx * cell + this.cloudOffset + camPos.x - span / 2;
          let pz = gz * cell + camPos.z - span / 2;
          // 512m 环绕
          px = camPos.x + ((((px - camPos.x) % 512) + 768) % 512) - 256;
          pz = camPos.z + ((((pz - camPos.z) % 512) + 768) % 512) - 256;
          m.makeTranslation(px, 118, pz);
          this.clouds.setMatrixAt(n++, m);
        }
      // 未用实例缩放到 0
      m.makeScale(0, 0, 0);
      for (; n < this.clouds.count; n++) this.clouds.setMatrixAt(n, m);
      this.clouds.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    (this.sun.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.sun.material as THREE.MeshBasicMaterial).dispose();
    (this.moon.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.moon.material as THREE.MeshBasicMaterial).dispose();
    this.sun.geometry.dispose();
    this.moon.geometry.dispose();
    this.starGeo.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.clouds.geometry.dispose();
    (this.clouds.material as THREE.Material).dispose();
  }
}
