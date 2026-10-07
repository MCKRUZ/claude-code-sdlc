// A station's ring (studio-observatory.md §5.1). The plugin's four stage states each get a SHAPE,
// not just a hue: `signed` is a filled ring, `completed` the same hue with a hollow core (the
// same colour on purpose — the cue is the shape, so "done without a name" is never mistaken for
// "signed"), `current` breathes through `uPulse`, and `later` is dashed around its circumference
// (`discard` on the angle) in the later colour. Rendered on the ring geometry and, for the filled
// states, on the core disc; `uCore` tells the shader which it is drawing.
//
// Round 2 (I1): a fixed-key lambert `uShade` (0.18, a GLSL constant — the uniform set is pinned)
// that ONLY DARKENS the face turned from the key, so the token colour is still the brightest
// pixel on the ring: the sidebar's green and the rail's green stay the same green.
import { Color, DoubleSide, ShaderMaterial } from 'three'
import type { IUniform } from 'three'

/** Mirrors `NodeKind` order from `shared/nav.ts`; the number the shader branches on. */
export const RING_KIND = { signed: 0, completed: 1, current: 2, later: 3 } as const
export type RingKindName = keyof typeof RING_KIND

export interface RingUniforms {
  uKind: IUniform<number>
  uPulse: IUniform<number>
  uCore: IUniform<number>
  uColor: IUniform<Color>
  [uniform: string]: IUniform
}

const VERT = /* glsl */ `
  varying vec2 vLocal;
  varying vec3 vNormal;
  void main() {
    vLocal = position.xy;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** The fixed key, view space; `abs` so the double-sided back face is shaded like the front. */
export const SHADE_GLSL = /* glsl */ `
  const float uShade = 0.18;
  const vec3 uKeyDir = normalize(vec3(0.4, 0.8, 0.6));
  float shadeFactor(vec3 n) {
    float lambert = abs(dot(normalize(n), uKeyDir));
    return 1.0 - uShade * (1.0 - lambert);
  }
`

const FRAG = /* glsl */ `
  uniform float uKind;
  uniform float uPulse;
  uniform float uCore;
  uniform vec3 uColor;
  varying vec2 vLocal;
  varying vec3 vNormal;
  ${SHADE_GLSL}
  void main() {
    float alpha = 1.0;
    if (uKind > 2.5) {
      // later: dashed ring, no core at all
      if (uCore > 0.5) discard;
      float a = atan(vLocal.y, vLocal.x) / 6.283 + 0.5;
      if (fract(a * 20.0) > 0.5) discard;
      alpha = 0.8;
    } else if (uKind > 1.5) {
      // current: solid ring; the core breathes with uPulse
      if (uCore > 0.5) alpha = 0.55 + 0.45 * uPulse;
    } else if (uKind > 0.5) {
      // completed: ring only, core hollow
      if (uCore > 0.5) discard;
    }
    // Only ever ≤ 1: the token is the brightest pixel.
    gl_FragColor = vec4(uColor * shadeFactor(vNormal), alpha);
  }
`

export class RingMaterial extends ShaderMaterial {
  declare uniforms: RingUniforms

  constructor(kind: RingKindName, color: Color, core = false) {
    super({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: DoubleSide,
      uniforms: {
        uKind: { value: RING_KIND[kind] },
        uPulse: { value: 1 },
        uCore: { value: core ? 1 : 0 },
        uColor: { value: color.clone() },
      },
    })
  }

  setKind(kind: RingKindName): void {
    this.uniforms.uKind.value = RING_KIND[kind]
  }

  /** 0…1 from the breathing tween; only the `current` core reads it. */
  setPulse(value: number): void {
    this.uniforms.uPulse.value = value
  }

  setColor(color: Color): void {
    this.uniforms.uColor.value.copy(color)
  }
}
