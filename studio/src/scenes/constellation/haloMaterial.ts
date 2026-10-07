// The halo behind a body (studio-observatory.md §5.2 "Geometry" → Halos): one
// `InstancedMesh(PlaneGeometry(1,1))` billboarded in the vertex shader, additive, carrying the
// shared glow DataTexture, with a per-instance `aGlow` (nextUp 0.7, hover / focus 0.6, else 0).
// Inline GLSL — shaders are compiled by WebGL, not governed by the CSP.
import { AdditiveBlending, Color, ShaderMaterial } from 'three'
import type { IUniform, Texture } from 'three'

export const HALO_NEXT_UP = 0.7
export const HALO_HOVER = 0.6
/** Halo quad size relative to the body radius. */
export const HALO_SCALE = 4.2

const VERTEX = /* glsl */ `
  attribute float aGlow;
  attribute float aScale;
  varying vec2 vUv;
  varying float vGlow;
  void main() {
    vUv = uv;
    vGlow = aGlow;
    // instanceMatrix carries the body's translation; the quad faces the camera regardless of it.
    vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 corner = (position.xy) * aScale;
    gl_Position = projectionMatrix * (centre + vec4(corner, 0.0, 0.0));
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vGlow;
  void main() {
    if (vGlow <= 0.001) discard;
    float a = texture2D(uMap, vUv).a * vGlow;
    gl_FragColor = vec4(uColor, a);
  }
`

export interface HaloUniforms {
  uMap: IUniform<Texture>
  uColor: IUniform<Color>
}

export class HaloMaterial extends ShaderMaterial {
  declare uniforms: HaloUniforms & Record<string, IUniform>

  constructor(map: Texture, color: Color) {
    super({
      uniforms: { uMap: { value: map }, uColor: { value: color.clone() } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    })
  }

  setColor(color: Color): void {
    this.uniforms.uColor.value.copy(color)
  }
}
