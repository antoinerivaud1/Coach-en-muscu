"use client";

export type ChartPoint = { label: string; value: number };

type Props = {
  points: ChartPoint[];
  color?: string;
  unit?: string;
};

/**
 * Petite courbe SVG sans dépendance. Responsive via viewBox.
 */
export default function LineChart({
  points,
  color = "#2FE6FF",
  unit = "kg",
}: Props) {
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

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Courbe de progression"
    >
      <defs>
        <linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {areaPath && <path d={areaPath} fill="url(#lc-grad)" />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r="2.5"
          fill={color}
        />
      ))}

      {/* max / min labels */}
      <text x={padX} y={11} fill="#8C8C97" fontSize="10">
        {Math.round(max)} {unit}
      </text>
      <text x={padX} y={H - 8} fill="#56565E" fontSize="10">
        {firstLabel}
      </text>
      <text x={W - padX} y={H - 8} fill="#56565E" fontSize="10" textAnchor="end">
        {lastLabel}
      </text>
    </svg>
  );
}
