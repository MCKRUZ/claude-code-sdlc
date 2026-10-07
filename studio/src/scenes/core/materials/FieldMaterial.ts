// The Ambient field's points (studio-observatory.md §5.3). Soft discs whose size falls off with
// distance, drifting on three octaves of value noise in the VERTEX shader — so one draw call
// moves 420 points and the CPU touches nothing per frame but `uTime`. Pure decoration: the
// material carries no data input at all, by design.
import { AdditiveBlending, Color, NormalBlending, ShaderMaterial } from 'three'
import type { IUniform } from 'three'

export interface FieldUniforms {
  uTime: IUniform<number>
  uColor: IUniform<Color>
  uOpacity: IUniform<number>
  uDpr: IUniform<number>
  uFade: IUniform<number>
  [uniform: string]: IUniform
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uDpr;
  attribute float aSize;
  varying float vSize;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i), n100 = hash(i + vec3(1,0,0)), n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1)), n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
    float x00 = mix(n000, n100, f.x), x10 = mix(n010, n110, f.x), x01 = mix(n001, n101, f.x), x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }
  vec3 drift(vec3 p, float t) {
    vec3 q = p * 0.35 + vec3(t * 0.011);
    vec3 d = vec3(vnoise(q), vnoise(q + 19.1), vnoise(q + 47.3)) - 0.5;
    d += 0.5 * (vec3(vnoise(q * 2.0), vnoise(q * 2.0 + 7.7), vnoise(q * 2.0 + 3.3)) - 0.5);
    d += 0.25 * (vec3(vnoise(q * 4.0), vnoise(q * 4.0 + 5.1), vnoise(q * 4.0 + 9.9)) - 0.5);
    return d;
  }
  void main() {
    vec3 p = position + drift(position, uTime) * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Soft discs at the slab's depth: visible as a field, not as noise and not as snow. The
    // per-point size (0.9–2.6) is the only variety; it carries no data.
    vSize = aSize;
    gl_PointSize = aSize * (1.5 / -mv.z) * uDpr * 46.0;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFade;
  varying float vSize;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // A wide feather (0.5 → 0.05) so every disc is soft; larger discs are fainter, so the field
    // reads as depth rather than confetti.
    float a = smoothstep(0.5, 0.05, d) * mix(1.0, 0.4, clamp((vSize - 0.9) / 1.7, 0.0, 1.0));
    gl_FragColor = vec4(uColor, a * uOpacity * uFade);
  }
`

export class FieldMaterial extends ShaderMaterial {
  declare uniforms: FieldUniforms

  constructor(color: Color, opacity: number, dark: boolean) {
    super({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: dark ? AdditiveBlending : NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color.clone() },
        uOpacity: { value: opacity },
        uDpr: { value: 1 },
        uFade: { value: 0 },
      },
    })
  }

  setTime(seconds: number): void {
    this.uniforms.uTime.value = seconds
  }

  /** 0 → 1 over the 900 ms fade-in. */
  setFade(value: number): void {
    this.uniforms.uFade.value = value
  }

  setAppearance(color: Color, opacity: number, dark: boolean): void {
    this.uniforms.uColor.value.copy(color)
    this.uniforms.uOpacity.value = opacity
    this.blending = dark ? AdditiveBlending : NormalBlending
    this.needsUpdate = true
  }
}
