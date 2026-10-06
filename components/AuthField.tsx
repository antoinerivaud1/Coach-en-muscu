// CM-58 : champ de formulaire d'auth, style « Direction Sport ».

export default function AuthField({
  label,
  name,
  type,
  autoComplete,
  defaultValue,
  error,
  minLength,
  autoFocus,
}: {
  label: string;
  name: string;
  type: "email" | "password";
  autoComplete: string;
  defaultValue?: string;
  error?: string;
  minLength?: number;
  autoFocus?: boolean;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <label className="block">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-fg-muted">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        minLength={minLength}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`mt-1.5 w-full rounded-xl border bg-surface2 px-4 py-3 text-base text-fg placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-energy/70 ${
          error ? "border-red-400/60" : "border-line"
        }`}
      />
      {error && (
        <span id={errorId} className="mt-1 block text-xs font-semibold text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}
