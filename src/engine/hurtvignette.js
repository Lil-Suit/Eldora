import * as THREE from 'three';

// Tela de dano desenhada DENTRO da imagem 3D (um triângulo que cobre a tela toda, em coordenadas de tela).
// Assim ela tem sempre exatamente o tamanho da imagem do jogo — não depende de medidas da página
// (barra do Android, tela cheia, recorte da câmera), que deixavam uma faixa sem vermelho.
export class HurtVignette {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { alpha: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, thick: { value: 0.2 }, col: { value: new THREE.Color(0xcd1919) } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform float alpha; uniform vec2 res; uniform float thick; uniform vec3 col;
        void main(){
          vec2 p = gl_FragCoord.xy; float m = min(res.x, res.y);
          vec2 e = min(p, res - p) / m;                       // distância até a borda (fração do lado menor)
          float d = min(e.x, e.y);
          float c = length(max(vec2(thick) - e, 0.0)) / thick; // cantos arredondados
          float a = max(1.0 - smoothstep(0.0, thick, d), c * 0.6);
          a = clamp(a, 0.0, 1.0); a = a * a;
          gl_FragColor = vec4(col, a * alpha);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 100000;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.peak = 0; this.hold = 0; this.a = 0;
    this._v = new THREE.Vector2();
  }

  // a: força (0–1); thick: grossura do brilho (fração do lado menor da tela)
  flash(a, thick = 0.2) { this.peak = Math.max(this.a, Math.min(1, a)); this.a = this.peak; this.hold = 0.14; this.mat.uniforms.thick.value = thick; }

  update(dt, renderer) {
    if (this.a <= 0) { this.mesh.visible = false; return; }
    if (this.hold > 0) this.hold -= dt; else this.a = Math.max(0, this.a - dt * (this.peak / 0.3)); // some em 0,3 s
    this.mesh.visible = this.a > 0;
    this.mat.uniforms.alpha.value = this.a * 0.85;
    renderer.getDrawingBufferSize(this._v);
    this.mat.uniforms.res.value.copy(this._v);
  }
}
