// A `depends_on` edge (studio-observatory.md §5.2 "Materials / shaders"). Extends three's
// `LineMaterial` (plain JS from `three/examples/jsm/lines`, no fetch, no worker) through
// `onBeforeCompile`, adding a travelling dash that moves dependency → dependent so the direction
// of the edge is visible without reading the legend. The flow runs only while `uFlow` is non-zero
// — the constellation sets it from the demand loop when motion is on and the pointer is inside —
// so an idle graph is still. Ghost tethers (`uGhost`) are dashed and never flow.
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { LineMaterialParameters } from 'three/examples/jsm/lines/LineMaterial.js'
import type { Color, IUniform, WebGLProgramParametersWithUniforms } from 'three'

export interface TetherExtraUniforms {
  uFlow: IUniform<number>
  uGhost: IUniform<number>
  /** On-fraction of a static dash: 0.5 is 1:1 (ghost tethers), 2/3 is 2:1 (the build-order path). */
  uDuty: IUniform<number>
}

export class TetherMaterial extends LineMaterial {
  readonly extra: TetherExtraUniforms = { uFlow: { value: 0 }, uGhost: { value: 0 }, uDuty: { value: 0.5 } }

  constructor(color: Color, params: Omit<LineMaterialParameters, 'color'> = {}) {
    super({ linewidth: 1.6, worldUnits: false, transparent: true, ...params })
    this.color.copy(color)
    this.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uFlow = this.extra.uFlow
      shader.uniforms.uGhost = this.extra.uGhost
      shader.uniforms.uDuty = this.extra.uDuty
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'uniform float opacity;',
          'uniform float opacity;\nuniform float uFlow;\nuniform float uGhost;\nuniform float uDuty;',
        )
        .replace(
          '#include <premultiplied_alpha_fragment>',
          [
            // vUv.y runs 0 → 1 along each segment in LineMaterial's own varying. A ghost is a
            // static dash; a live tether's dash slides by uFlow (advanced by the demand loop).
            'float along = vUv.y - uFlow;',
            'float dash = fract(along * 6.0);',
            'if (uGhost > 0.5 && dash > uDuty) discard;',
            // A hint, not a conveyor: the flow dims only a quarter of the alpha.
            'if (uGhost < 0.5 && uFlow > 0.0) gl_FragColor.a *= 0.75 + 0.25 * smoothstep(0.2, 0.8, dash);',
            '#include <premultiplied_alpha_fragment>',
          ].join('\n'),
        )
    }
  }

  /** Advance the travelling dash; wraps so the float never grows. */
  advanceFlow(delta: number): void {
    this.extra.uFlow.value = (this.extra.uFlow.value + delta) % 1
  }

  setFlowing(flowing: boolean): void {
    if (!flowing) this.extra.uFlow.value = 0
    else if (this.extra.uFlow.value === 0) this.extra.uFlow.value = 1e-4
  }

  /** A static dash that never flows. `duty` is the on-fraction (default 1:1). */
  setGhost(ghost: boolean, duty = 0.5): void {
    this.extra.uGhost.value = ghost ? 1 : 0
    this.extra.uDuty.value = duty
  }
}
