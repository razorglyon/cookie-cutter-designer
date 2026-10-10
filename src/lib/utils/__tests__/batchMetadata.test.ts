import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { unzipSync, strFromU8 } from 'fflate';
import { serialize3MF } from '../advancedExporter';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
it.each([undefined, DEFAULT_PARAMS])('3MF only claims geometry metadata when known: %s', params => {
  const mesh = new Group(); mesh.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  const archive = unzipSync(serialize3MF(mesh, params));
  const xml = strFromU8(archive['3D/3dmodel.model']);
  expect(xml).toContain('unit="millimeter"'); expect(xml).toContain('<metadata name="Title">Cookie Cutter</metadata>');
  expect(xml.includes('ccd:WallThickness')).toBe(params !== undefined);
  expect(xml.includes('ccd:CuttingHeight')).toBe(params !== undefined);
  expect(archive['_rels/.rels']).toBeDefined(); expect(archive['[Content_Types].xml']).toBeDefined();
});
