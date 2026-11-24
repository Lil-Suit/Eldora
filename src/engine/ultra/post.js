// =============================================================
// Ultra realismo — pós-processamento próprio (sem EffectComposer):
//   cena em HDR (meio-float, MSAA no PC) + profundidade →
//   SSAO (meia resolução, 12 amostras + desfoque bilateral) → bloom (cadeia de 5 mips, filtro 13 toques/tenda) →
//   raios de sol (1/4 da resolução, marcha radial na profundidade) →
//   composição: oclusão, perspectiva aérea (Mie para o lado do sol), neblina de altura nos vales,
//   bloom, raios, exposição, ACES, gradação de cor, vinheta, nitidez e pontilhado (sem faixas no céu).
// =============================================================
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMMON = /* glsl */`
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float lumi(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

function mat(frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMMON + frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
}

// núcleo do SSAO: 12 amostras num hemisfério, mais concentradas perto do ponto
function aoKernel(n) {
  let s = 7, out = [];
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, z = 0.15 + rnd() * 0.85, r = Math.sqrt(1 - z * z);
    let k = (i + 1) / n; k = 0.15 + 0.85 * k * k;
    out.push(`vec3(${(Math.cos(a) * r * k).toFixed(4)}, ${(Math.sin(a) * r * k).toFixed(4)}, ${(z * k).toFixed(4)})`);
  }
  return `const vec3 KER[${n}] = vec3[${n}](${out.join(', ')});`;
}

export class UltraPost {
  constructor(renderer, { touch = false } = {}) {
    this.r = renderer; this.touch = touch;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g); this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.overlay = new THREE.Scene(); // coisas desenhadas por cima da imagem final (tela de dano)
    this.w = 0; this.h = 0; this.iw = 0; this.ih = 0;
    this._v = new THREE.Vector2(); this._v3 = new THREE.Vector3();
    this.samples = touch ? 0 : 4;
    this.maxPix = touch ? 1.5e6 : 4.2e6; // resolução interna máxima do pós (celular de tela enorme não paga o quádruplo)
    const n = (x) => ({ value: x });
    const NS = this.touch ? 10 : 12;
    // ---------- SSAO ----------
    this.aoMat = mat(/* glsl */`
      uniform sampler2D tDepth; uniform vec2 uFull; uniform mat4 uProj; uniform mat4 uProjInv; uniform float uNear; uniform float uFar; uniform float uRadius; uniform float uPow;
      ${aoKernel(NS)}
      float vz(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
      vec3 vpos(vec2 uv, float d) { vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
      void main() {
        float d = texture2D(tDepth, vUv).r;
        if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        vec3 P = vpos(vUv, d);
        vec2 px = 1.0 / uFull;
        vec3 pr = vpos(vUv + vec2(px.x, 0.0), texture2D(tDepth, vUv + vec2(px.x, 0.0)).r);
        vec3 pl = vpos(vUv - vec2(px.x, 0.0), texture2D(tDepth, vUv - vec2(px.x, 0.0)).r);
        vec3 pu = vpos(vUv + vec2(0.0, px.y), texture2D(tDepth, vUv + vec2(0.0, px.y)).r);
        vec3 pd = vpos(vUv - vec2(0.0, px.y), texture2D(tDepth, vUv - vec2(0.0, px.y)).r);
        vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
        vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
        vec3 N = normalize(cross(dx, dy));
        if (dot(N, P) > 0.0) N = -N;
        float ang = ign(gl_FragCoord.xy) * 6.2831853;
        vec3 rv = vec3(cos(ang), sin(ang), 0.37);
        vec3 T = normalize(rv - N * dot(rv, N)), B = cross(N, T);
        float R = uRadius * (1.0 + clamp(-P.z / 60.0, 0.0, 1.5)); // longe: raio maior (ainda dá contato nas árvores)
        float occ = 0.0;
        for (int i = 0; i < ${NS}; i++) {
          vec3 k = KER[i];
          vec3 S = P + (T * k.x + B * k.y + N * k.z) * R;
          vec4 o = uProj * vec4(S, 1.0); vec2 suv = o.xy / o.w * 0.5 + 0.5;
          float sz = vz(texture2D(tDepth, suv).r);
          float range = smoothstep(0.0, 1.0, R / max(abs(P.z - sz), 1e-3));
          occ += step(S.z + 0.02 * R, sz) * range;
        }
        float ao = 1.0 - occ / float(${NS});
        ao = pow(clamp(ao, 0.0, 1.0), uPow);
        ao = mix(ao, 1.0, smoothstep(70.0, 160.0, -P.z));
        gl_FragColor = vec4(ao, 0.0, 0.0, 1.0);
      }`, { tDepth: n(null), uFull: n(new THREE.Vector2()), uProj: n(new THREE.Matrix4()), uProjInv: n(new THREE.Matrix4()), uNear: n(0.3), uFar: n(900), uRadius: n(0.9), uPow: n(1.6) });
    this.blurMat = mat(/* glsl */`
      uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir; uniform float uNear; uniform float uFar;
      float lz(vec2 uv) { float d = texture2D(tDepth, uv).r; return -(uNear * uFar) / ((uFar - uNear) * d - uFar); }
      void main() {
        float z0 = lz(vUv), s = 0.0, w = 0.0;
        for (int i = -3; i <= 3; i++) {
          vec2 uv = vUv + uDir * float(i);
          float wt = exp(-float(i * i) / 7.0) * max(0.0, 1.0 - abs(lz(uv) - z0) / (0.04 * z0 + 0.15));
          s += texture2D(tAO, uv).r * wt; w += wt;
        }
        gl_FragColor = vec4(s / max(w, 1e-4), 0.0, 0.0, 1.0);
      }`, { tAO: n(null), tDepth: n(null), uDir: n(new THREE.Vector2()), uNear: n(0.3), uFar: n(900) });
    // ---------- bloom ----------
    this.preMat = mat(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uExpo; uniform float uThr; uniform float uKnee;
      vec3 k(vec2 o) { vec3 c = min(texture2D(tSrc, vUv + o * uTexel).rgb * uExpo, vec3(80.0)); return c / (1.0 + lumi(c) * 0.25); } // média de Karis: sem vaga-lume piscando
      void main() {
        vec3 c = (k(vec2(-1.0, -1.0)) + k(vec2(1.0, -1.0)) + k(vec2(-1.0, 1.0)) + k(vec2(1.0, 1.0))) * 0.25;
        c = c / max(1.0 - lumi(c) * 0.25, 0.05);
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
        gl_FragColor = vec4(c * max(soft, br - uThr) / max(br, 1e-4), 1.0);
      }`, { tSrc: n(null), uTexel: n(new THREE.Vector2()), uExpo: n(1), uThr: n(1), uKnee: n(0.5) });
    this.downMat = mat(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel;
      vec3 t(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
      void main() {
        vec3 c = t(0.0, 0.0) * 0.125;
        c += (t(-2.0, 2.0) + t(2.0, 2.0) + t(-2.0, -2.0) + t(2.0, -2.0)) * 0.03125;
        c += (t(0.0, 2.0) + t(-2.0, 0.0) + t(2.0, 0.0) + t(0.0, -2.0)) * 0.0625;
        c += (t(-1.0, 1.0) + t(1.0, 1.0) + t(-1.0, -1.0) + t(1.0, -1.0)) * 0.125;
        gl_FragColor = vec4(c, 1.0);
      }`, { tSrc: n(null), uTexel: n(new THREE.Vector2()) });
    this.upMat = mat(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uW;
      vec3 t(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
      void main() {
        vec3 c = t(0.0, 0.0) * 4.0 + (t(-1.0, 0.0) + t(1.0, 0.0) + t(0.0, 1.0) + t(0.0, -1.0)) * 2.0 + t(-1.0, -1.0) + t(1.0, -1.0) + t(-1.0, 1.0) + t(1.0, 1.0);
        gl_FragColor = vec4(c / 16.0 * uW, 1.0);
      }`, { tSrc: n(null), uTexel: n(new THREE.Vector2()), uW: n(1) }, { blending: THREE.AdditiveBlending, transparent: true });
    // ---------- raios de sol ----------
    const NR = this.touch ? 24 : 40;
    this.raysMat = mat(/* glsl */`
      uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect;
      void main() {
        vec2 dlt = uSun - vUv; float L = length(dlt);
        vec2 st = dlt / float(${NR}) * min(1.0, 0.75 / max(L, 1e-3));
        vec2 p = vUv + st * ign(gl_FragCoord.xy);
        float acc = 0.0, dec = 1.0;
        for (int i = 0; i < ${NR}; i++) {
          float sky = step(0.99999, texture2D(tDepth, p).r);
          vec2 dd = p - uSun; dd.x *= uAspect;
          acc += sky * exp(-dot(dd, dd) * 7.0) * dec;
          dec *= 0.955; p += st;
        }
        gl_FragColor = vec4(acc / float(${NR}) * 3.0, 0.0, 0.0, 1.0);
      }`, { tDepth: n(null), uSun: n(new THREE.Vector2()), uAspect: n(1) });
    // ---------- composição final ----------
    this.compMat = mat(/* glsl */`
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tAO; uniform sampler2D tBloom; uniform sampler2D tRays;
      uniform vec2 uRes; uniform mat4 uProjInv; uniform mat4 uViewInv; uniform vec3 uCam;
      uniform float uExpo; uniform float uAO; uniform float uBloom; uniform float uRays; uniform float uSharp; uniform float uVig; uniform float uSat; uniform float uCon;
      uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uHor; uniform vec3 uHfCol;
      uniform float uWaterY; uniform float uMie; uniform float uAP; uniform float uHF; uniform float uHFbase; uniform float uHFfall; uniform float uTime;
      uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uWarm;
      vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c) {
        const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        return clamp(O * RRTAndODTFit(I * (c / 0.6)), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() {
        vec2 px = 1.0 / uRes;
        vec3 c = texture2D(tColor, vUv).rgb;
        if (uSharp > 0.0) { // nitidez leve (o MSAA/upscale amolece a imagem)
          vec3 nb = texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb + texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb + texture2D(tColor, vUv + vec2(0.0, px.y)).rgb + texture2D(tColor, vUv - vec2(0.0, px.y)).rgb;
          c = max(c + (c - nb * 0.25) * uSharp * clamp(1.0 / (1.0 + lumi(c) * 0.5), 0.2, 1.0), 0.0);
        }
        float d = texture2D(tDepth, vUv).r;
        bool sky = d >= 0.99999;
        vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w;
        vec3 wd = normalize((uViewInv * vec4(vp.xyz, 0.0)).xyz);
        float dist = sky ? 420.0 : length(vp.xyz);
        // a água não grava profundidade: o que está no buffer é o fundo do lago. Para a neblina e a oclusão
        // vale a superfície (senão a água fica "leitosa" de tanta neblina no caminho até o fundo).
        float wet = 0.0;
        if (!sky && uCam.y > uWaterY && uCam.y + wd.y * dist < uWaterY - 0.03) { dist = min(dist, (uCam.y - uWaterY) / max(-wd.y, 1e-4)); wet = 1.0; }
        c *= mix(1.0, texture2D(tAO, vUv).r, uAO * (1.0 - wet));
        float mu = dot(wd, uSunDir);
        // perspectiva aérea: o ar entre você e o morro espalha a luz do sol (mais forte olhando para o sol)
        if (!sky) {
          float ap = 1.0 - exp(-dist * uAP);
          const float g = 0.72;
          float ph = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * mu, 1e-3), 1.5) * 0.05;
          c = c * (1.0 - ap * 0.28) + (uHor * 0.28 + uSunCol * ph * uMie) * ap;
        }
        // neblina de altura: deita nos vales, rios e no lago (integral exata da densidade exponencial no raio)
        if (uHF > 0.0) {
          vec3 wp = uCam + wd * dist;
          float h0 = uCam.y - uHFbase, dy = wp.y - uCam.y, k = uHFfall;
          float fx = abs(k * dy) > 1e-3 ? (1.0 - exp(-k * dy)) / (k * dy) : 1.0;
          float hf = 1.0 - exp(-uHF * exp(-k * h0) * dist * fx);
          hf *= sky ? 0.6 : 1.0;
          float ph2 = 0.6 + 1.4 * pow(max(mu, 0.0), 4.0);
          c = mix(c, uHfCol + uSunCol * ph2 * 0.25 * uMie, clamp(hf, 0.0, 0.92));
        }
        c *= uExpo;
        c += texture2D(tBloom, vUv).rgb * uBloom;
        c += uSunCol * texture2D(tRays, vUv).r * uRays;
        c = aces(c);
        // gradação: sombras frias / luzes quentes, saturação, contraste
        float l = lumi(c);
        c *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.55, l));
        c = max(mix(vec3(l), c, uSat), 0.0);
        vec3 s = toSRGB(c);
        s = clamp((s - 0.5) * uCon + 0.5, 0.0, 1.0);
        vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y * 0.75;
        s *= 1.0 - uVig * pow(clamp(length(q) * 1.25, 0.0, 1.0), 2.4);
        s += (ign(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0) - 0.5) / 255.0;
        gl_FragColor = vec4(s, 1.0);
      }`, {
      tColor: n(null), tDepth: n(null), tAO: n(null), tBloom: n(null), tRays: n(null),
      uRes: n(new THREE.Vector2()), uProjInv: n(new THREE.Matrix4()), uViewInv: n(new THREE.Matrix4()), uCam: n(new THREE.Vector3()),
      uExpo: n(1), uAO: n(0.85), uBloom: n(0.06), uRays: n(0.5), uSharp: n(0.25), uVig: n(0.22), uSat: n(1.08), uCon: n(1.04),
      uSunDir: n(new THREE.Vector3(0, 1, 0)), uSunCol: n(new THREE.Color()), uHor: n(new THREE.Color()), uHfCol: n(new THREE.Color()),
      uWaterY: n(-1e4), uMie: n(1), uAP: n(0.003), uHF: n(0), uHFbase: n(0), uHFfall: n(0.25), uTime: n(0),
      uShadowTint: n(new THREE.Color(0.98, 1.0, 1.04)), uHighTint: n(new THREE.Color(1.03, 1.0, 0.96)), uWarm: n(0),
    });
    this.ok = this.check();
  }

  // a placa de vídeo consegue desenhar em meio-float? (quase todas; senão o Ultra fica sem pós)
  check() {
    const ext = this.r.extensions;
    return !!(ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
  }

  ensure() {
    const v = this.r.getDrawingBufferSize(this._v), w = Math.max(1, v.x), h = Math.max(1, v.y);
    if (w === this.w && h === this.h && this.rtMain) return;
    this.w = w; this.h = h;
    const sc = Math.min(1, Math.sqrt(this.maxPix / (w * h)));
    const iw = this.iw = Math.max(1, Math.round(w * sc)), ih = this.ih = Math.max(1, Math.round(h * sc));
    this.disposeTargets();
    const HF = THREE.HalfFloatType;
    this.rtMain = new THREE.WebGLRenderTarget(iw, ih, { type: HF, samples: this.samples, depthTexture: new THREE.DepthTexture(iw, ih, THREE.UnsignedIntType), depthBuffer: true });
    this.rtMain.texture.minFilter = this.rtMain.texture.magFilter = THREE.LinearFilter;
    const hw = Math.max(1, iw >> 1), hh = Math.max(1, ih >> 1);
    const R8 = { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false };
    this.rtAO = new THREE.WebGLRenderTarget(hw, hh, R8); this.rtAO2 = new THREE.WebGLRenderTarget(hw, hh, R8);
    this.rtRays = new THREE.WebGLRenderTarget(Math.max(1, iw >> 2), Math.max(1, ih >> 2), R8);
    this.bl = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < (this.touch ? 4 : 5); i++) { this.bl.push(new THREE.WebGLRenderTarget(bw, bh, { type: HF, depthBuffer: false })); bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
  }

  disposeTargets() {
    for (const k of ['rtMain', 'rtAO', 'rtAO2', 'rtRays']) { if (this[k]) { this[k].depthTexture?.dispose(); this[k].dispose(); this[k] = null; } }
    for (const t of this.bl || []) t.dispose();
    this.bl = [];
  }

  dispose() {
    this.disposeTargets(); this.w = this.h = 0;
    for (const m of [this.aoMat, this.blurMat, this.preMat, this.downMat, this.upMat, this.raysMat, this.compMat]) m.dispose();
    this.quad.geometry.dispose();
  }

  pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.qScene, this.qCam); }

  // P: parâmetros da composição (exposição, neblina, gradação…) calculados pela atmosfera
  render(scene, camera, P) {
    const r = this.r;
    this.ensure();
    const autoClear = r.autoClear;
    // 1) a cena inteira em HDR
    r.autoClear = true;
    r.setRenderTarget(this.rtMain);
    r.render(scene, camera);
    r.autoClear = false;
    const dt = this.rtMain.depthTexture, near = camera.near, far = camera.far;
    // 2) oclusão de ambiente
    const A = this.aoMat.uniforms;
    if (P.ao > 0) {
      A.tDepth.value = dt; A.uFull.value.set(this.iw, this.ih); A.uProj.value.copy(camera.projectionMatrix); A.uProjInv.value.copy(camera.projectionMatrixInverse);
      A.uNear.value = near; A.uFar.value = far; A.uRadius.value = P.aoRadius; A.uPow.value = P.aoPow;
      this.pass(this.aoMat, this.rtAO);
      const B = this.blurMat.uniforms; B.tDepth.value = dt; B.uNear.value = near; B.uFar.value = far;
      B.tAO.value = this.rtAO.texture; B.uDir.value.set(1.5 / this.rtAO.width, 0); this.pass(this.blurMat, this.rtAO2);
      B.tAO.value = this.rtAO2.texture; B.uDir.value.set(0, 1.5 / this.rtAO.height); this.pass(this.blurMat, this.rtAO);
    }
    // 3) bloom
    const pre = this.preMat.uniforms;
    pre.tSrc.value = this.rtMain.texture; pre.uTexel.value.set(1 / this.iw, 1 / this.ih); pre.uExpo.value = P.expo; pre.uThr.value = P.bloomThr; pre.uKnee.value = P.bloomThr * 0.6;
    this.pass(this.preMat, this.bl[0]);
    const D = this.downMat.uniforms;
    for (let i = 1; i < this.bl.length; i++) { D.tSrc.value = this.bl[i - 1].texture; D.uTexel.value.set(1 / this.bl[i - 1].width, 1 / this.bl[i - 1].height); this.pass(this.downMat, this.bl[i]); }
    const U = this.upMat.uniforms;
    for (let i = this.bl.length - 1; i > 0; i--) { U.tSrc.value = this.bl[i].texture; U.uTexel.value.set(1 / this.bl[i].width, 1 / this.bl[i].height); U.uW.value = 0.85; this.pass(this.upMat, this.bl[i - 1]); }
    // 4) raios de sol (só olhando para o lado do sol)
    const C = this.compMat.uniforms;
    let rays = 0;
    if (P.rays > 0.001) {
      const s = this._v3.copy(P.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
      const fwd = camera.getWorldDirection(this._fw ||= new THREE.Vector3());
      const face = THREE.MathUtils.smoothstep(fwd.dot(P.sunDir), 0.05, 0.55);
      rays = P.rays * face;
      if (rays > 0.001) {
        const R = this.raysMat.uniforms; R.tDepth.value = dt; R.uSun.value.set(s.x * 0.5 + 0.5, s.y * 0.5 + 0.5); R.uAspect.value = this.iw / this.ih;
        this.pass(this.raysMat, this.rtRays);
      }
    }
    // 5) composição na tela
    C.tColor.value = this.rtMain.texture; C.tDepth.value = dt; C.tAO.value = P.ao > 0 ? this.rtAO.texture : null; C.tBloom.value = this.bl[0].texture; C.tRays.value = this.rtRays.texture;
    C.uAO.value = P.ao > 0 ? P.ao : 0;
    C.uRes.value.set(this.iw, this.ih); C.uProjInv.value.copy(camera.projectionMatrixInverse); C.uViewInv.value.copy(camera.matrixWorld); C.uCam.value.copy(camera.position);
    C.uExpo.value = P.expo; C.uBloom.value = P.bloom; C.uRays.value = rays * P.expo; C.uSharp.value = P.sharp; C.uVig.value = P.vig; C.uSat.value = P.sat; C.uCon.value = P.con;
    C.uSunDir.value.copy(P.sunDir); C.uSunCol.value.copy(P.sunCol); C.uHor.value.copy(P.hor); C.uHfCol.value.copy(P.hfCol);
    C.uWaterY.value = P.waterY ?? -1e4; C.uMie.value = P.mie; C.uAP.value = P.ap; C.uHF.value = P.hf; C.uHFbase.value = P.hfBase; C.uHFfall.value = P.hfFall; C.uTime.value = P.time;
    C.uShadowTint.value.copy(P.shadowTint); C.uHighTint.value.copy(P.highTint);
    if (!C.tAO.value) { C.tAO.value = this.rtRays.texture; C.uAO.value = 0; }
    if (rays <= 0.001) C.uRays.value = 0;
    this.pass(this.compMat, null);
    // 6) por cima: tela de dano (vermelho na borda) sem passar pela neblina/tone mapping
    if (this.overlay.children.some((o) => o.visible)) r.render(this.overlay, camera);
    r.autoClear = autoClear;
  }
}
