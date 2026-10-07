/**
 * Soft fur for the mascot by shell texturing: every mesh whose name ends in "Fur" gets an instanced
 * stack of slightly inflated copies; each layer keeps only the pixels where a strand still exists at
 * that height, so strands thin out towards the tips. One extra draw call per furry part; the layer
 * count drops on phones. The vertex colour's red channel masks bald areas (the face).
 */
import * as THREE from "three";

export type FurOptions = { layers: number; length: number; density: number };

export const FUR_DESKTOP: FurOptions = { layers: 14, length: 0.034, density: 260 };
export const FUR_MOBILE: FurOptions = { layers: 6, length: 0.028, density: 200 };

const COMMON = /* glsl */ `
  uniform float uLayers;
  uniform float uLength;
  uniform float uDensity;
  varying vec3 vFurPos;
  varying float vFurShell;
  varying float vFurMask;
`;

function furMaterial(base: THREE.MeshPhysicalMaterial, o: FurOptions, shells: boolean) {
  const m = base.clone();
  m.name = `${base.name}${shells ? "Shells" : "Base"}`;
  m.vertexColors = false;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLayers = { value: o.layers };
    shader.uniforms.uLength = { value: o.length };
    shader.uniforms.uDensity = { value: o.density };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        ${COMMON}
        attribute vec3 color;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFurMask = color.r;
        vFurPos = position;
        ${
          shells
            ? `vFurShell = float(gl_InstanceID + 1) / uLayers;
               transformed += normalize(objectNormal) * uLength * vFurShell * vFurMask;
               transformed.y -= uLength * 0.35 * vFurShell * vFurShell;`
            : "vFurShell = 0.0;"
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        ${COMMON}
        float furHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        ${
          shells
            ? `if (vFurMask < 0.5) discard;
               vec3 cell = floor(vFurPos * uDensity);
               vec3 local = fract(vFurPos * uDensity) - 0.5;
               float r = furHash(cell);
               vec3 jitter = vec3(furHash(cell + 1.7), furHash(cell + 3.1), furHash(cell + 5.3)) - 0.5;
               float d = length(local - jitter * 0.35);
               // Taller and shorter strands; each tapers to a point.
               float h = 0.45 + 0.55 * r;
               if (vFurShell > h || d > (1.0 - vFurShell / h) * 0.62) discard;`
            : ""
        }
        // Darker at the roots, lighter at the tips: gives the fur depth.
        diffuseColor.rgb *= mix(0.72, 1.08, ${shells ? "vFurShell" : "0.0"}) * mix(1.0, 0.92, 1.0 - vFurMask);`,
      );
  };
  m.customProgramCacheKey = () => `fur-${shells ? "s" : "b"}-${o.layers}`;
  return m;
}

/** Adds fur shells under every "*Fur" mesh of the model (call once after loading). */
export function addFur(model: THREE.Object3D, o: FurOptions) {
  const meshes: THREE.Mesh[] = [];
  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && obj.name.endsWith("Fur") && !obj.userData.fur) meshes.push(obj as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const base = mesh.material as THREE.MeshPhysicalMaterial;
    mesh.material = furMaterial(base, o, false);
    const shells = new THREE.InstancedMesh(mesh.geometry, furMaterial(base, o, true), o.layers);
    shells.name = `${mesh.name}Shells`;
    shells.frustumCulled = false;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < o.layers; i++) shells.setMatrixAt(i, identity);
    shells.userData.fur = true;
    mesh.userData.fur = true;
    mesh.add(shells);
  }
}
