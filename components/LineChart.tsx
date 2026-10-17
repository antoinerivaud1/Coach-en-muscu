"use client";

export type ChartPoint = { label: string; value: number };

type Props = {
  points: ChartPoint[];
  unit?: string;
};

/**
 * Petite courbe SVG sans dépendance. Responsive via viewBox. Couleurs du
 * thème : lisible en clair comme en sombre (CM-118).
 */
export default function LineChart({ points, unit = "kg" }: Props) {
  const W = 320;
  const H = 160;
  const padX = 8;
  const padTop = 16;
  const padBottom = 22;

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-fg-muted">
        Pas encore de données
      </p>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const x = (i: number) =>
    points.length === 1
      ? W / 2
      : padX + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padTop + innerH - ((v - min) / range) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 1
      ? `${linePath} L ${x(points.length - 1).toFixed(1)} ${padTop + innerH} L ${x(0).toFixed(1)} ${padTop + innerH} Z`
      : "";

  const firstLabel = points[0]!.label;
  const lastLabel = points[points.length - 1]!.label;

  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1]!.value);

  // CM-118 (A2) : courbe neutre, seul le dernier point est orange.
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Courbe de progression"
    >
      <line x1={0} y1={padTop + innerH} x2={W} y2={padTop + innerH} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
      {areaPath && <path d={areaPath} fill="rgb(var(--fg) / 0.05)" />}
      <path
        d={linePath}
        fill="none"
        stroke="rgb(var(--fg) / 0.9)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="6" fill="rgb(var(--energy))" stroke="rgb(var(--surface))" strokeWidth="3" vectorEffect="non-scaling-stroke" />

      {/* max / min labels */}
      <text x={padX} y={11} fill="rgb(var(--fg-muted))" fontSize="12">
        {Math.round(max)} {unit}
      </text>
      <text x={padX} y={H - 6} fill="rgb(var(--fg-muted))" fontSize="12">
        {firstLabel}
      </text>
      <text x={W - padX} y={H - 6} fill="rgb(var(--fg-muted))" fontSize="12" textAnchor="end">
        {lastLabel}
      </text>
    </svg>
  );
}
