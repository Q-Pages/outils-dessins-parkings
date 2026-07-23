// src/store/projectFile.test.ts
import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, ProjectData } from './projectFile';
import { DEFAULT_SOLVER_PARAMS } from '../geometry/types';

const sampleProject: ProjectData = {
  boundary: [{ lat: 43.6, lng: 3.88 }, { lat: 43.601, lng: 3.88 }, { lat: 43.601, lng: 3.882 }],
  exclusions: [],
  accessPoints: [{ lat: 43.6, lng: 3.881 }],
  params: DEFAULT_SOLVER_PARAMS,
};

describe('projectFile', () => {
  it('round-trips a project through JSON serialization', () => {
    const json = serializeProject(sampleProject);
    const parsed = deserializeProject(json);
    expect(parsed.boundary).toEqual(sampleProject.boundary);
    expect(parsed.accessPoints).toEqual(sampleProject.accessPoints);
    expect(parsed.params.standardStallWidth).toBe(DEFAULT_SOLVER_PARAMS.standardStallWidth);
  });

  it('throws a clear error on invalid JSON', () => {
    expect(() => deserializeProject('not json')).toThrow();
  });
});
