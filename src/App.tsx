// src/App.tsx
import { useMemo } from 'react';
import { polygon as turfPolygon, point as turfPoint } from '@turf/helpers';
import kinks from '@turf/kinks';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { MapView } from './components/MapView';
import { ParamsPanel } from './components/ParamsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { Legend } from './components/Legend';
import { useProjectStore } from './store/projectStore';
import { makeProjection } from './geometry/projection';
import { solveParkingConfigurations } from './geometry/solver';
import { exportConfigToDxf } from './export/dxfExporter';
import { deserializeProject, serializeProject } from './store/projectFile';
import './App.css';

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  const boundary = useProjectStore((s) => s.boundary);
  const exclusions = useProjectStore((s) => s.exclusions);
  const accessPoints = useProjectStore((s) => s.accessPoints);
  const params = useProjectStore((s) => s.params);
  const configs = useProjectStore((s) => s.configs);
  const selectedConfigIndex = useProjectStore((s) => s.selectedConfigIndex);
  const setConfigs = useProjectStore((s) => s.setConfigs);
  const loadProject = useProjectStore((s) => s.loadProject);

  const projection = useMemo(() => {
    if (boundary.length === 0) return null;
    return makeProjection(boundary[0]);
  }, [boundary]);

  const handleGenerate = () => {
    if (!projection || boundary.length < 3) {
      alert('Trace un contour de terrain avant de générer un plan.');
      return;
    }

    const invalidParamEntry = Object.entries(params).find(
      ([key, value]) => key !== 'pmrRatio' && key !== 'angleDeg' && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    );
    if (invalidParamEntry) {
      alert(`Le paramètre "${invalidParamEntry[0]}" doit être un nombre positif — vérifie les valeurs saisies.`);
      return;
    }

    const ring = [...boundary, boundary[0]].map((p) => [p.lng, p.lat]);
    const kinksResult = kinks(turfPolygon([ring]));
    if (kinksResult.features.length > 0) {
      alert('Le contour tracé se croise lui-même — corrige le tracé avant de générer un plan.');
      return;
    }

    const boundaryPolygon = turfPolygon([ring]);
    const outsideAccessPoints = accessPoints.filter(
      (p) => !booleanPointInPolygon(turfPoint([p.lng, p.lat]), boundaryPolygon)
    );
    if (outsideAccessPoints.length > 0) {
      alert(`${outsideAccessPoints.length} point(s) d'accès sont en dehors du contour tracé — déplace-les sur le contour avant de générer un plan.`);
      return;
    }

    const exclusionPolygons = exclusions.map((exclusionRing) =>
      turfPolygon([[...exclusionRing, exclusionRing[0]].map((p) => [p.lng, p.lat])])
    );
    const accessPointsInExclusion = accessPoints.filter((p) =>
      exclusionPolygons.some((exclusionPolygon) => booleanPointInPolygon(turfPoint([p.lng, p.lat]), exclusionPolygon))
    );
    if (accessPointsInExclusion.length > 0) {
      alert(`${accessPointsInExclusion.length} point(s) d'accès sont à l'intérieur d'une zone d'exclusion — déplace-les avant de générer un plan.`);
      return;
    }

    const localBoundary = boundary.map((p) => projection.toLocal(p));
    const localExclusions = exclusions.map((ring) => ring.map((p) => projection.toLocal(p)));
    const localAccessPoints = accessPoints.map((p) => projection.toLocal(p));

    const results = solveParkingConfigurations({
      boundary: localBoundary,
      exclusions: localExclusions,
      accessPoints: localAccessPoints,
      baseParams: params,
    });

    if (results.length === 0) {
      alert("Aucune configuration valide n'a pu être générée sur ce terrain.");
      return;
    }

    setConfigs(results);
  };

  const handleExportDxf = () => {
    if (!projection || configs.length === 0) return;
    const localBoundary = boundary.map((p) => projection.toLocal(p));
    const localExclusions = exclusions.map((ring) => ring.map((p) => projection.toLocal(p)));
    const dxf = exportConfigToDxf(configs[selectedConfigIndex], localBoundary, localExclusions);
    downloadFile('plan-parking.dxf', dxf, 'application/dxf');
  };

  const handleExportProject = () => {
    const json = serializeProject({ boundary, exclusions, accessPoints, params });
    downloadFile('projet-parking.json', json, 'application/json');
  };

  const handleImportProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = deserializeProject(reader.result as string);
        loadProject(data);
      } catch (error) {
        alert(`Impossible de charger ce fichier de projet : ${error instanceof Error ? error.message : 'erreur inconnue'}.`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-layout">
      <div className="map-container">
        <MapView planConfig={configs[selectedConfigIndex]} projection={projection} />
      </div>
      <div className="side-panel">
        <ParamsPanel />
        <div className="actions">
          <button onClick={handleGenerate}>Générer le plan</button>
          <button onClick={handleExportDxf} disabled={configs.length === 0}>
            Exporter en DXF
          </button>
          <button onClick={handleExportProject}>Sauvegarder le projet</button>
          <label className="import-button">
            Charger un projet
            <input
              type="file"
              accept="application/json"
              onChange={(e) => e.target.files && handleImportProject(e.target.files[0])}
            />
          </label>
        </div>
        <ResultsPanel />
        <Legend />
      </div>
    </div>
  );
}
