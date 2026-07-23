interface LegendItem {
  color: string;
  label: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  { color: '#3388ff', label: 'Contour du terrain et zones d\'exclusion' },
  { color: '#ffffff', label: 'Place standard' },
  { color: '#1d5fd6', label: 'Place PMR' },
  { color: '#ffcc00', label: 'Voie de circulation (flèche = sens)' },
  { color: '#2a9df4', label: 'Point d\'accès' },
];

export function Legend() {
  return (
    <div className="legend">
      <h4>Légende</h4>
      <ul>
        {LEGEND_ITEMS.map((item) => (
          <li key={item.label}>
            <span className="legend-swatch" style={{ backgroundColor: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
