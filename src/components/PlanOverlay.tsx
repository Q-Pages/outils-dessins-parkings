// src/components/PlanOverlay.tsx
import { Fragment, useMemo } from 'react';
import { Polygon, Polyline } from 'react-leaflet';
import { LatLng, Point } from '../geometry/projection';
import { ParkingConfig } from '../geometry/types';
import { aisleDirectionArrows } from '../geometry/aisleRendering';
import { stallDividerLines } from '../geometry/stallMarkings';

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

  // stallDividerLines est O(n²) (comparaison de chaque place avec toutes les autres) —
  // mémoïsé pour ne pas le recalculer à chaque rendu (pan/zoom de la carte), seulement
  // quand la liste de places change réellement.
  const dividerLines = useMemo(() => stallDividerLines(config.stalls), [config.stalls]);
  const pmrStalls = config.stalls.filter((stall) => stall.isPmr);

  return (
    <>
      {dividerLines.map(([a, b], index) => (
        <Polyline key={index} positions={toLatLngPositions([a, b])} pathOptions={{ color: '#ffffff', weight: 1 }} />
      ))}
      {pmrStalls.map((stall) => (
        <Polygon
          key={stall.id}
          positions={toLatLngPositions(stall.corners)}
          pathOptions={{ color: '#1d5fd6', weight: 1, fillColor: '#1d5fd6', fillOpacity: 0.7 }}
        />
      ))}
      {config.aisles.map((aisle, aisleIndex) => (
        <Fragment key={aisleIndex}>
          {config.loadType === 'double' && (
            <Polyline
              positions={toLatLngPositions(aisle.centerline)}
              pathOptions={{ color: '#ffffff', weight: 2, dashArray: '6 6' }}
            />
          )}
          {aisleDirectionArrows(aisle, config.loadType).map((arrow, arrowIndex) => (
            <Polygon
              key={arrowIndex}
              positions={toLatLngPositions(arrow)}
              pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.9 }}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}
