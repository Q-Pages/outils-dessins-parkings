// src/components/PlanOverlay.tsx
import { Fragment } from 'react';
import { Polygon, Polyline } from 'react-leaflet';
import { LatLng, Point } from '../geometry/projection';
import { ParkingConfig } from '../geometry/types';
import { aisleDirectionArrows } from '../geometry/aisleRendering';

export interface PlanProjection {
  toLatLng(p: Point): LatLng;
}

interface PlanOverlayProps {
  config: ParkingConfig;
  projection: PlanProjection;
}

export function PlanOverlay({ config, projection }: PlanOverlayProps) {
  const toLatLngPositions = (points: Point[]): [number, number][] =>
    points.map((p) => {
      const ll = projection.toLatLng(p);
      return [ll.lat, ll.lng];
    });

  return (
    <>
      {config.stalls.map((stall) => (
        <Polygon
          key={stall.id}
          positions={toLatLngPositions(stall.corners)}
          pathOptions={
            stall.isPmr
              ? { color: '#1d5fd6', weight: 1, fillColor: '#1d5fd6', fillOpacity: 0.7 }
              : { color: '#ffffff', weight: 1, fillOpacity: 0 }
          }
        />
      ))}
      {config.aisles.map((aisle, aisleIndex) => (
        <Fragment key={aisleIndex}>
          {config.loadType === 'double' && (
            <Polyline
              positions={toLatLngPositions(aisle.centerline)}
              pathOptions={{ color: '#ffcc00', weight: 2, dashArray: '6 6' }}
            />
          )}
          {aisleDirectionArrows(aisle, config.loadType).map((arrow, arrowIndex) => (
            <Polygon
              key={arrowIndex}
              positions={toLatLngPositions(arrow)}
              pathOptions={{ color: '#ffcc00', fillColor: '#ffcc00', fillOpacity: 0.9 }}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}
