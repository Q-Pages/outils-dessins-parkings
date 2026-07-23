// src/components/ResultsPanel.tsx
import { useProjectStore } from '../store/projectStore';

export function ResultsPanel() {
  const configs = useProjectStore((s) => s.configs);
  const selectedConfigIndex = useProjectStore((s) => s.selectedConfigIndex);
  const selectConfig = useProjectStore((s) => s.selectConfig);

  if (configs.length === 0) {
    return <div className="results-panel">Aucune configuration générée pour l'instant.</div>;
  }

  const selected = configs[selectedConfigIndex];

  return (
    <div className="results-panel">
      <h3>Résultats</h3>
      <p>
        {selected.totalCount} places ({selected.standardCount} standard + {selected.pmrCount} PMR) —{' '}
        {selected.angleDeg}° — voie {selected.loadType === 'double' ? 'double sens' : 'simple sens'}
      </p>
      <h4>Alternatives</h4>
      <ul>
        {configs.map((config, index) => (
          <li key={index}>
            <button onClick={() => selectConfig(index)} disabled={index === selectedConfigIndex}>
              {config.totalCount} places — {config.angleDeg}° — {config.loadType}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
