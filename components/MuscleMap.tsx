// Schéma corporel original (face + dos) avec le muscle ciblé surligné.
// Aucune image externe : tout est dessiné en SVG, piloté par muscle_group.

const BODY = "#3f3f46"; // zinc-700
const HI = "#ef4444"; // red-500

// Quels figures/zones surligner pour chaque groupe musculaire.
const TARGETS: Record<string, { front: string[]; back: string[] }> = {
  chest: { front: ["chest"], back: [] },
  back: { front: [], back: ["back"] },
  shoulders: { front: ["delts"], back: ["delts"] },
  biceps: { front: ["arms"], back: [] },
  triceps: { front: [], back: ["arms"] },
  quads: { front: ["thighs"], back: [] },
  hamstrings: { front: [], back: ["thighs"] },
  glutes: { front: [], back: ["glutes"] },
  calves: { front: [], back: ["calves"] },
  core: { front: ["abs"], back: [] },
  other: { front: [], back: [] },
};

function Figure({
  cx,
  zones,
  label,
}: {
  cx: number;
  zones: string[];
  label: string;
}) {
  const on = (z: string) => zones.includes(z);
  return (
    <g>
      {/* --- corps de base --- */}
      {/* tête */}
      <circle cx={cx} cy={28} r={14} fill={BODY} />
      {/* cou */}
      <rect x={cx - 5} y={40} width={10} height={9} rx={3} fill={BODY} />
      {/* torse */}
      <path
        d={`M ${cx - 25} 58 Q ${cx - 27} 51 ${cx - 20} 50 L ${cx + 20} 50 Q ${cx + 27} 51 ${cx + 25} 58 L ${cx + 17} 112 Q ${cx + 17} 119 ${cx + 9} 119 L ${cx - 9} 119 Q ${cx - 17} 119 ${cx - 17} 112 Z`}
        fill={BODY}
      />
      {/* bras */}
      <path
        d={`M ${cx - 23} 58 L ${cx - 33} 96 L ${cx - 35} 132`}
        stroke={BODY}
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d={`M ${cx + 23} 58 L ${cx + 33} 96 L ${cx + 35} 132`}
        stroke={BODY}
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* jambes */}
      <path
        d={`M ${cx - 10} 120 L ${cx - 14} 174 L ${cx - 15} 214`}
        stroke={BODY}
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d={`M ${cx + 10} 120 L ${cx + 14} 174 L ${cx + 15} 214`}
        stroke={BODY}
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* --- surlignages --- */}
      <g filter="url(#mm-glow)">
        {on("delts") && (
          <>
            <circle cx={cx - 22} cy={56} r={8} fill={HI} />
            <circle cx={cx + 22} cy={56} r={8} fill={HI} />
          </>
        )}
        {on("chest") && (
          <>
            <ellipse cx={cx - 9} cy={68} rx={9} ry={7} fill={HI} />
            <ellipse cx={cx + 9} cy={68} rx={9} ry={7} fill={HI} />
          </>
        )}
        {on("back") && (
          <path
            d={`M ${cx - 18} 56 L ${cx + 18} 56 L ${cx + 14} 100 L ${cx - 14} 100 Z`}
            fill={HI}
          />
        )}
        {on("abs") && (
          <rect x={cx - 11} y={78} width={22} height={32} rx={5} fill={HI} />
        )}
        {on("arms") && (
          <>
            <path
              d={`M ${cx - 25} 60 L ${cx - 33} 92`}
              stroke={HI}
              strokeWidth={9}
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M ${cx + 25} 60 L ${cx + 33} 92`}
              stroke={HI}
              strokeWidth={9}
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}
        {on("glutes") && (
          <>
            <ellipse cx={cx - 8} cy={124} rx={10} ry={9} fill={HI} />
            <ellipse cx={cx + 8} cy={124} rx={10} ry={9} fill={HI} />
          </>
        )}
        {on("thighs") && (
          <>
            <path
              d={`M ${cx - 10} 124 L ${cx - 13} 168`}
              stroke={HI}
              strokeWidth={12}
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M ${cx + 10} 124 L ${cx + 13} 168`}
              stroke={HI}
              strokeWidth={12}
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}
        {on("calves") && (
          <>
            <path
              d={`M ${cx - 14} 180 L ${cx - 15} 210`}
              stroke={HI}
              strokeWidth={11}
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M ${cx + 14} 180 L ${cx + 15} 210`}
              stroke={HI}
              strokeWidth={11}
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}
      </g>

      <text
        x={cx}
        y={234}
        textAnchor="middle"
        fontSize={11}
        fill="#a1a1aa"
        fontWeight={600}
      >
        {label}
      </text>
    </g>
  );
}

export default function MuscleMap({ muscleGroup }: { muscleGroup: string }) {
  const t = TARGETS[muscleGroup] ?? TARGETS.other!;
  return (
    <svg
      viewBox="0 0 220 244"
      role="img"
      aria-label={`Muscle ciblé : ${muscleGroup}`}
      className="h-44 w-full"
    >
      <defs>
        <filter id="mm-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <Figure cx={58} zones={t.front} label="Face" />
      <Figure cx={162} zones={t.back} label="Dos" />
    </svg>
  );
}
