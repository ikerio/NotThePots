import * as THREE from 'three';

// Renders into a low-resolution, anti-aliased target, then upscales it softly
// (bilinear + a horizontal VI-style blur) with a gentle 16-bit dither, the way
// N64 games looked on a CRT.

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uDither;
uniform float uScale;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  // the N64 video interface softened every frame horizontally
  vec2 px1 = vec2(1.0 / uRes.x, 0.0);
  vec3 lin = texture2D(tDiffuse, vUv).rgb * 0.5
    + texture2D(tDiffuse, vUv - px1 * 0.75).rgb * 0.25
    + texture2D(tDiffuse, vUv + px1 * 0.75).rgb * 0.25;
  vec3 c = toSRGB(lin);
  c = mix(c, uFlashColor, uFlash);
  // gentle vignette, like a CRT edge falloff
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.35;
  vec2 px = floor(gl_FragCoord.xy / uScale);
  float d = (bayer4(px) - 0.5) * uDither / 31.0;
  c = floor((c + d) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export class N64Renderer {
  constructor(canvas) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(1);
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.lines = 480;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      samples: 4,
    });
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(4, 4) },
        uDither: { value: 0.75 },
        uScale: { value: 1 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(quad);
    this.postCam = new THREE.Camera();
    this.width = 1;
    this.height = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get flash() { return this.post.uniforms.uFlash; }
  get flashColor() { return this.post.uniforms.uFlashColor.value; }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.gl.setSize(w, h);
    const ih = Math.min(this.lines, h);
    const iw = Math.round(ih * (w / h));
    this.rt.setSize(iw, ih);
    this.post.uniforms.uRes.value.set(iw, ih);
    this.post.uniforms.uScale.value = Math.max(1, h / ih);
    this.aspect = w / h;
    for (const fn of this.listeners || []) fn(w, h);
  }

  onResize(fn) {
    (this.listeners ||= []).push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }

  render(scene, camera) {
    this.gl.setRenderTarget(this.rt);
    this.gl.render(scene, camera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCam);
  }
}
