// src/components/MapView.tsx
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { useProjectStore } from '../store/projectStore';

const COORDS_REGEX = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/;

async function searchAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const coordsMatch = query.match(COORDS_REGEX);
  if (coordsMatch) {
    return { lat: parseFloat(coordsMatch[1]), lng: parseFloat(coordsMatch[3]) };
  }

  const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }
  const [lng, lat] = feature.geometry.coordinates;
  return { lat, lng };
}

function SearchBar() {
  const map = useMap();
  const [query, setQuery] = useState('');

  const handleSearch = async () => {
    const result = await searchAddress(query);
    if (result) {
      map.setView([result.lat, result.lng], 19);
    } else {
      alert("Adresse ou coordonnées introuvables.");
    }
  };

  return (
    <div className="search-bar">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Adresse ou coordonnées (lat, lng)"
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button onClick={handleSearch}>Rechercher</button>
    </div>
  );
}

function DrawingLayer() {
  const map = useMap();
  const setBoundary = useProjectStore((s) => s.setBoundary);
  const setExclusions = useProjectStore((s) => s.setExclusions);
  const setAccessPoints = useProjectStore((s) => s.setAccessPoints);

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new (L as any).Control.Draw({
      draw: {
        polygon: true,
        marker: true,
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems },
    });
    map.addControl(drawControl);

    // Après toute création/édition/suppression, on reconstruit l'état complet à partir
    // des calques actuellement présents sur la carte (source de vérité), plutôt que de
    // suivre des index individuels qui deviendraient invalides après une suppression.
    function syncStoreFromLayers() {
      const polygonRings: L.LatLng[][] = [];
      const accessPoints: L.LatLng[] = [];

      drawnItems.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          accessPoints.push(layer.getLatLng());
        } else if (layer instanceof L.Polygon) {
          const ring = (layer.getLatLngs()[0] as L.LatLng[]).slice();
          polygonRings.push(ring);
        }
      });

      const [boundary, ...exclusionRings] = polygonRings;

      setBoundary(boundary === undefined ? [] : boundary.map((p) => ({ lat: p.lat, lng: p.lng })));
      setExclusions(exclusionRings.map((ring) => ring.map((p) => ({ lat: p.lat, lng: p.lng }))));
      setAccessPoints(accessPoints.map((p) => ({ lat: p.lat, lng: p.lng })));
    }

    function handleCreated(event: any) {
      drawnItems.addLayer(event.layer);
      syncStoreFromLayers();
    }

    map.on((L as any).Draw.Event.CREATED, handleCreated);
    map.on((L as any).Draw.Event.EDITED, syncStoreFromLayers);
    map.on((L as any).Draw.Event.DELETED, syncStoreFromLayers);

    return () => {
      map.off((L as any).Draw.Event.CREATED, handleCreated);
      map.off((L as any).Draw.Event.EDITED, syncStoreFromLayers);
      map.off((L as any).Draw.Event.DELETED, syncStoreFromLayers);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, setBoundary, setExclusions, setAccessPoints]);

  return null;
}

export function MapView() {
  return (
    <MapContainer center={[46.6, 2.5]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
      />
      <SearchBar />
      <DrawingLayer />
    </MapContainer>
  );
}
