import { BufferGeometry, BoxGeometry, CylinderGeometry, SphereGeometry } from "three";
import type { Material } from "three";

/** Sahne boyunca paylaÅŸÄ±lan malzeme / geometri kayÄ±tlarÄ± (sayfa kapanÄ±rken dispose edilir). */
export const mats: Material[] = [];
export const geometries: BufferGeometry[] = [];

// Paylaşılan temel geometriler
export const unitBoxGeo = new BoxGeometry(1, 1, 1);
export const unitCylGeo = new CylinderGeometry(1, 1, 1, 14);
export const unitSphereGeo = new SphereGeometry(1, 12, 8);
geometries.push(unitBoxGeo, unitCylGeo, unitSphereGeo);
