"use client";

type DiffRow = {
  source_name?: string;
  edge_type?: string;
  target_name?: string;
  temporal_mutation_class?: string;
};

export default function BiTemporalScrubber({
  baseline,
  incident,
  atTime,
  onChange,
  rows,
}: {
  baseline: number;
  incident: number;
  atTime: number;
  onChange: (value: number) => void;
  rows: DiffRow[];
}) {
  const span = Math.max(1, incident - baseline);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[#8d9284]">
        <span>Valid time</span>
        <span>{atTime >= incident ? "incident" : "scrubbing"}</span>
      </div>
      <input
        type="range"
        min={baseline}
        max={incident}
        value={Math.min(Math.max(atTime, baseline), incident)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#d6ff4a]"
        aria-label="Valid time"
      />
      <div className="flex justify-between font-mono text-[10px] text-[#8d9284]">
        <span>baseline −{Math.round(span / 86400)}d</span>
        <span>incident</span>
      </div>
      <ul className="max-h-24 overflow-auto font-mono text-[11px] leading-4 text-[#c8c4b6]">
        {rows.map((row, index) => (
          <li key={`${row.source_name}-${row.target_name}-${index}`}>
            {row.temporal_mutation_class}: {row.source_name} -{row.edge_type}-&gt; {row.target_name}
          </li>
        ))}
        {rows.length === 0 && <li>No temporal mutations in this window.</li>}
      </ul>
    </div>
  );
}
