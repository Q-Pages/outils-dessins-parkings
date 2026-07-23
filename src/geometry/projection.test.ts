// src/geometry/projection.test.ts
import { describe, it, expect } from 'vitest';
import { makeProjection } from './projection';

describe('makeProjection', () => {
  it('projects the origin to (0,0)', () => {
    const proj = makeProjection({ lat: 43.6, lng: 3.88 });
    const p = proj.toLocal({ lat: 43.6, lng: 3.88 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('round-trips toLocal/toLatLng', () => {
    const proj = makeProjection({ lat: 43.6, lng: 3.88 });
    const original = { lat: 43.601234, lng: 3.881234 };
    const local = proj.toLocal(original);
    const back = proj.toLatLng(local);
    expect(back.lat).toBeCloseTo(original.lat, 8);
    expect(back.lng).toBeCloseTo(original.lng, 8);
  });

  it('approximates real-world distance for 1 degree of latitude (~111.32km)', () => {
    const proj = makeProjection({ lat: 43.6, lng: 3.88 });
    const p = proj.toLocal({ lat: 44.6, lng: 3.88 });
    expect(p.y).toBeCloseTo(111320, -3);
  });
});
