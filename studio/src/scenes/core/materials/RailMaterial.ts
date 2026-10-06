// The Spine's rail (studio-observatory.md §5.1 "Materials / shaders"). Along the tube's u axis:
// up to `uLit` the rail is the signed colour exactly as the token renders (the count of SIGNED
// stations, never time — no emissive lift, so the rail and the sidebar are the same green); from
// `uLit` to `uCurrent` it is FLAT `uLine` — no gradient, because a gradient would read as
// progress between stations and the plugin never reported one; beyond `uCurrent` it is a dashed
// hairline at 50 % alpha. `uDraw` sweeps 0 → 1 once on first open so the rail draws itself in.
// Shaders are inline strings: compiled by WebGL, not fetched, so the CSP never sees them.
//
// Round 2 (I1): the tube is shaded by the same fixed-key lambert as the rings (`SHADE_GLSL`,
// `uShade` 0.18 as a constant). It only darkens, AFTER the span branch, so the lit span's token
// is still its brightest pixel and the FLAT span between `uLit` and `uCurrent` is still one
// colour with no gradient along u.
import { Color, DoubleSide, ShaderMaterial } from 'three'
import type { IUniform } from 'three'
import { SHADE_GLSL } from './RingMaterial'

export interface RailUniforms {
  uLit: IUniform<number>
  uCurrent: IUniform<number>
  uDraw: IUniform<number>
  uLine: IUniform<Color>
  uSigned: IUniform<Color>
  [uniform: string]: IUniform
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uLit;
  uniform float uCurrent;
  uniform float uDraw;
  uniform vec3 uLine;
  uniform vec3 uSigned;
  varying vec2 vUv;
  varying vec3 vNormal;
  ${SHADE_GLSL}
  void main() {
    float u = vUv.x;
    if (u > uDraw) discard;
    vec3 color;
    float alpha = 1.0;
    if (u <= uLit) {
      color = uSigned;
    } else if (u <= uCurrent) {
      color = uLine;
    } else {
      float dash = step(0.5, fract(u * 36.0));
      if (dash < 0.5) discard;
      color = uLine;
      alpha = 0.5;
    }
    gl_FragColor = vec4(color * shadeFactor(vNormal), alpha);
  }
`

export class RailMaterial extends ShaderMaterial {
  declare uniforms: RailUniforms

  constructor(line: Color, signed: Color) {
    super({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: DoubleSide,
      uniforms: {
        uLit: { value: 0 },
        uCurrent: { value: 0 },
        uDraw: { value: 1 },
        uLine: { value: line.clone() },
        uSigned: { value: signed.clone() },
      },
    })
  }

  /** Both as fractions of the rail's length, from the ordered `stage_state` list. */
  setProgress(lit: number, current: number): void {
    this.uniforms.uLit.value = lit
    this.uniforms.uCurrent.value = current
  }

  setColors(line: Color, signed: Color): void {
    this.uniforms.uLine.value.copy(line)
    this.uniforms.uSigned.value.copy(signed)
  }
}
