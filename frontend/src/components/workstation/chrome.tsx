export const INK = {
  void: "#060709",
  rack: "#0A0C10",
  module: "#0F1218",
  control: "#151922",
  line: "#1C202B",
  text: "#E2E8F0",
  mute: "#8B93A7",
  cyan: "#38BDF8",
  emerald: "#10B981",
  crimson: "#F43F5E",
  orange: "#FF5722",
  violet: "#A855F7",
  amber: "#F59E0B",
};

export function fixed(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

export function epoch(value: number | null | undefined): string {
  if (value === null || value === undefined || value >= 9999999999) return "open";
  return `${new Date(value * 1000).toISOString().slice(0, 19)}Z`;
}

export function Led({ color }: { color: string }) {
  return <span className="inline-block h-1 w-1 shrink-0" style={{ background: color }} />;
}

export function Crosshair() {
  return (
    <svg width="5" height="5" viewBox="0 0 5 5" aria-hidden className="pointer-events-none">
      <path d="M2.5 0v5M0 2.5h5" stroke="#5C6578" strokeWidth="1" />
    </svg>
  );
}

export function PanelButton({
  children,
  onClick,
  disabled,
  hot,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  hot?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-[2px] border px-2 font-mono text-[11px] tracking-wide disabled:opacity-40"
      style={{
        borderColor: hot ? "#E2E8F0" : INK.line,
        background: hot ? "#E2E8F0" : INK.control,
        color: hot ? INK.void : INK.text,
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      }}
    >
      {children}
    </button>
  );
}
