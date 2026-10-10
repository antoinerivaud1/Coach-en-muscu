// Légende de la carte musculaire (CM-30) : principal(aux) et secondaires,
// avec les noms lisibles des muscles.
import { getMuscleLegend } from "@/lib/exerciseMuscles";

function LegendItem({
  label,
  names,
  swatchClass,
  compact,
}: {
  label: string;
  names: string[];
  swatchClass: string;
  compact: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        <span className={`inline-block h-2.5 w-2.5 flex-none rounded-[3px] ${swatchClass}`} aria-hidden />
        {label}
      </span>
      <span className={`${compact ? "text-sm" : "text-base"} font-semibold text-fg`}>
        {/* Un nom ne se coupe jamais (« Ischio-jambiers », « Avant-bras »). */}
        {names.map((n, i) => (
          <span key={n}>
            <span className="whitespace-nowrap">{n}</span>
            {i < names.length - 1 ? ", " : ""}
          </span>
        ))}
      </span>
    </div>
  );
}

export default function MuscleLegend({
  name,
  muscleGroup,
  compact = false,
}: {
  name: string;
  muscleGroup: string;
  compact?: boolean;
}) {
  const { primary, secondary } = getMuscleLegend(name, muscleGroup);
  if (primary.length === 0 && secondary.length === 0) return null;

  return (
    <div className={compact ? "flex flex-col gap-2.5" : "grid grid-cols-2 gap-3 px-1"}>
      {primary.length > 0 && (
        <LegendItem
          label={primary.length > 1 ? "Principaux" : "Principal"}
          names={primary}
          swatchClass="bg-energy"
          compact={compact}
        />
      )}
      {secondary.length > 0 && (
        <LegendItem
          label={secondary.length > 1 ? "Secondaires" : "Secondaire"}
          names={secondary}
          swatchClass="bg-energy-dim"
          compact={compact}
        />
      )}
    </div>
  );
}
