// src/components/ParamsPanel.tsx
import { useProjectStore } from '../store/projectStore';

export function ParamsPanel() {
  const params = useProjectStore((s) => s.params);
  const setParams = useProjectStore((s) => s.setParams);

  return (
    <div className="params-panel">
      <h3>Paramètres</h3>
      <label>
        Largeur place standard (m)
        <input
          type="number"
          step="0.1"
          value={params.standardStallWidth}
          onChange={(e) => setParams({ standardStallWidth: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Longueur place standard (m)
        <input
          type="number"
          step="0.1"
          value={params.standardStallLength}
          onChange={(e) => setParams({ standardStallLength: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Largeur place PMR (m)
        <input
          type="number"
          step="0.1"
          value={params.pmrStallWidth}
          onChange={(e) => setParams({ pmrStallWidth: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Largeur voie simple sens (m)
        <input
          type="number"
          step="0.1"
          value={params.aisleWidthSingleLoaded}
          onChange={(e) => setParams({ aisleWidthSingleLoaded: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Largeur voie double sens (m)
        <input
          type="number"
          step="0.1"
          value={params.aisleWidthDoubleLoaded}
          onChange={(e) => setParams({ aisleWidthDoubleLoaded: parseFloat(e.target.value) })}
        />
      </label>
    </div>
  );
}
