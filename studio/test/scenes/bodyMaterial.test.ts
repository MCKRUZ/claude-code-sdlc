/** The instrument's materials v2 (studio-upgrade-2 I1 / I2) as promises on numbers and shader
 * strings, never on a screenshot: the body's rim and dot are ZERO at the centre of the disc, so
 * the centre pixel is still the status token's own answer ("body centre within ±2"); the ring and
 * rail shade ONLY DARKENS, so the token colour is the brightest pixel and the sidebar's green is
 * the rail's green; the shader strings carry `uRim` / `uShade`; and the RailMaterial's uniform
 * set and FLAT span are byte-identical to what `spineModel.test` pins. */

import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import {
  BodyMaterial, centreHalfCos, fresnelWeight, KEY_DIR, RIM_STRENGTH, RIM_TOKEN, SPEC_WEIGHT, specularWeight,
} from '../../src/scenes/core/materials/BodyMaterial'
import { RailMaterial } from '../../src/scenes/core/materials/RailMaterial'
import { RingMaterial, SHADE_GLSL } from '../../src/scenes/core/materials/RingMaterial'
import { HEMI_INTENSITY, KEY_INTENSITY, KEY_POSITION, RIM_LIGHT, RIM_POSITION } from '../../src/scenes/core/lights'

describe('BodyMaterial', () => {
  it('adds the fresnel rim and the specular dot to the standard material through onBeforeCompile, with uRim in the string', () => {
    const material = new BodyMaterial(new Color('#334155'), 'light')
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: '#include <common>\nvoid main() {\n#include <dithering_fragment>\n}' }
    material.patch(shader)
    expect(shader.fragmentShader).toContain('uniform float uRim;')
    expect(shader.fragmentShader).toContain('uRimColor')
    expect(shader.fragmentShader).toMatch(/pow\(1\.0 - bodyCos, 3\.0\) \* uRim/)
    expect(Object.keys(shader.uniforms).sort()).toEqual(['uRim', 'uRimColor', 'uRimMode', 'uSpec'])
    expect(shader.uniforms.uRim).toBe(material.rim.uRim)
    // Lambert / GGX are still three's: `onBeforeCompile` appends, it never replaces the lighting.
    expect(shader.fragmentShader).toContain('#include <dithering_fragment>')
    expect(material.roughness).toBe(0.72)
    expect(material.metalness).toBe(0)
  })

  it('rim: light darkens toward ink-2 (a mix), dark lifts additively toward accent-300', () => {
    expect(RIM_TOKEN).toEqual({ light: 'ink-2', dark: 'accent-300' })
    const light = new BodyMaterial(new Color('#334155'), 'light')
    expect(light.rim.uRimMode.value).toBe(0)
    light.setRim(new Color('#6fd1d4'), 'dark')
    expect(light.rim.uRimMode.value).toBe(1)
    expect(light.rim.uRimColor.value.getHexString()).toBe('6fd1d4')
    const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <dithering_fragment>' }
    light.patch(shader)
    expect(shader.fragmentShader).toContain('gl_FragColor.rgb += uRimColor * rim;')
    expect(shader.fragmentShader).toContain('gl_FragColor.rgb = mix(gl_FragColor.rgb, uRimColor, rim);')
  })

  it('body centre within ±2: both additions are zero (or under 2/255) where the normal faces the camera', () => {
    expect(fresnelWeight(1)).toBe(0)
    expect(fresnelWeight(0)).toBeCloseTo(RIM_STRENGTH)
    // Monotonic toward the silhouette.
    expect(fresnelWeight(0.5)).toBeGreaterThan(fresnelWeight(0.8))
    const centre = specularWeight(centreHalfCos()) * 255
    expect(centre).toBeLessThan(2)
    expect(specularWeight(1)).toBeCloseTo(SPEC_WEIGHT)
    // The key is off-axis, so the dot never lands on the centre.
    expect(Math.hypot(...KEY_DIR)).toBeCloseTo(1, 2)
    expect(KEY_DIR[2]).toBeLessThan(1)
  })
})

describe('Ring and rail shade (uShade)', () => {
  it('carries uShade 0.18 as a fixed-key lambert that ONLY darkens: the token is the brightest pixel', () => {
    expect(SHADE_GLSL).toContain('const float uShade = 0.18;')
    // factor = 1 − uShade · (1 − lambert) ∈ [1 − uShade, 1]: never above 1, never a lift.
    expect(SHADE_GLSL).toContain('return 1.0 - uShade * (1.0 - lambert);')
    expect(SHADE_GLSL).not.toMatch(/\+ uShade|1\.0 \+/)
    const ring = new RingMaterial('signed', new Color('#22aa66'))
    expect(ring.fragmentShader).toContain('uShade')
    expect(ring.fragmentShader).toContain('uColor * shadeFactor(vNormal)')
    expect(ring.vertexShader).toContain('vNormal = normalize(normalMatrix * normal);')
    // Not a uniform: the ring's uniform set is unchanged.
    expect(Object.keys(ring.uniforms).sort()).toEqual(['uColor', 'uCore', 'uKind', 'uPulse'])
  })

  it('rail: the shade is applied AFTER the span branch, so the FLAT span stays one colour and the uniform set is the pinned five', () => {
    const rail = new RailMaterial(new Color('#888888'), new Color('#22aa66'))
    expect(rail.fragmentShader).toContain('uShade')
    expect(Object.keys(rail.uniforms).sort()).toEqual(['uCurrent', 'uDraw', 'uLine', 'uLit', 'uSigned'])
    const between = rail.fragmentShader.split('u <= uCurrent) {')[1].split('}')[0]
    expect(between.trim()).toBe('color = uLine;')
    expect(rail.fragmentShader).not.toMatch(/mix\(/)
    expect(rail.fragmentShader).toContain('gl_FragColor = vec4(color * shadeFactor(vNormal), alpha);')
  })
})

describe('lighting rig (I2)', () => {
  it('is a three-point rig: hemisphere, warm key at (4, 6, 5), cool rim at (−5, 3, −4) in accent-300 .25 dark / ink-4 .15 light', () => {
    expect(KEY_POSITION).toEqual([4, 6, 5])
    expect(RIM_POSITION).toEqual([-5, 3, -4])
    expect(RIM_LIGHT.dark).toEqual({ token: 'accent-300', intensity: 0.25 })
    expect(RIM_LIGHT.light).toEqual({ token: 'ink-4', intensity: 0.15 })
    // Dark glows rather than glares: every intensity is lower.
    expect(KEY_INTENSITY.dark).toBeLessThanOrEqual(KEY_INTENSITY.light)
    expect(HEMI_INTENSITY.dark).toBeLessThan(HEMI_INTENSITY.light)
  })
})
