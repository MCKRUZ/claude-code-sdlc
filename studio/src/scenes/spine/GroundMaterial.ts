// The Spine's ground: a 14 × 6 plane under the rail carrying a hairline grid that fades with
// distance from the centre and dissolves towards the horizon (studio-observatory.md §5.1
// "Geometry": "a distance-faded grid shader"). Decoration only — the grid has no scale and marks nothing; the figcaption says height
// and depth carry no meaning. Inline GLSL; nothing fetched.
import { Color, DoubleSide, ShaderMaterial } from 'three'
import type { IUniform } from 'three'

export interface GroundUniforms {
  uColor: IUniform<Color>
  uOpacity: IUniform<number>
  [uniform: string]: IUniform
}

const VERT = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vLocal;
  void main() {
    // Hairlines every 0.5 world units, antialiased against the derivative so they stay thin.
    vec2 cell = abs(fract(vLocal / 0.5 - 0.5) - 0.5) / fwidth(vLocal / 0.5);
    float line = 1.0 - min(min(cell.x, cell.y), 1.0);
    // Fade with distance from the centre so the far edge dissolves into the page.
    float fade = 1.0 - smoothstep(1.5, 6.5, length(vLocal));
    // Horizon: local +y is world -z (the plane is rotated -90 deg about x), i.e. away from the
    // camera, so the grid thins towards the back instead of stopping at a hard edge. A depth cue
    // without a scale: height and depth still carry no meaning.
    float horizon = 1.0 - smoothstep(0.4, 3.0, vLocal.y);
    float alpha = line * fade * horizon * uOpacity;
    // A 3.5 % wash under the lines so the grid reads as a surface, not as floating hairlines.
    float wash = 0.035 * fade * horizon * uOpacity;
    // 'out' is a GLSL reserved word (the shader failed to compile in production and the ground
    // never drew); hence a plain name.
    float coverage = max(alpha, wash);
    if (coverage < 0.004) discard;
    gl_FragColor = vec4(uColor, coverage);
  }
`

export class GroundMaterial extends ShaderMaterial {
  declare uniforms: GroundUniforms

  constructor(color: Color, opacity = 0.28) {
    super({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uColor: { value: color.clone() },
        uOpacity: { value: opacity },
      },
    })
  }

  setColor(color: Color): void {
    this.uniforms.uColor.value.copy(color)
  }
}
