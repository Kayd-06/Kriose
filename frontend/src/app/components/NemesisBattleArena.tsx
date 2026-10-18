"use client";

type Branch = {
  action_id: string;
  action_name: string;
  action_type: string;
  ucb_score: number;
  survival: number;
  oncall_covered: boolean;
  kappa_after?: number | null;
  shields?: { blocked?: boolean; [key: string]: unknown };
};

export default function NemesisBattleArena({
  branches,
  winner,
  skipped,
}: {
  branches: Branch[];
  winner: string | null;
  skipped: string[];
}) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8d9284]">Depth-2 battle</p>
      {skipped.length > 0 && (
        <p className="font-mono text-[11px] text-[#e07a4a]">Not forked: {skipped.join(", ")}</p>
      )}
      {branches.length === 0 && <p className="text-sm text-[#8d9284]">No shadow graphs yet.</p>}
      {branches.map((branch) => {
        const won = branch.action_id === winner;
        const blocked = Boolean(branch.shields?.blocked);
        return (
          <article
            key={branch.action_id}
            className="border px-2 py-2"
            style={{
              borderColor: won ? "#d6ff4a" : "#2c3128",
              background: won ? "#1c2412" : "#141712",
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{branch.action_name}</h3>
              <span className="font-mono text-[11px]" style={{ color: won ? "#d6ff4a" : "#e07a4a" }}>
                {won ? "winner" : blocked ? "veto" : "lost"}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 font-mono text-[11px] text-[#c8c4b6]">
              <dt>type</dt>
              <dd className="text-right">{branch.action_type}</dd>
              <dt>UCB</dt>
              <dd className="text-right">{branch.ucb_score}</dd>
              <dt>survival</dt>
              <dd className="text-right">{branch.survival}</dd>
              <dt>on-call</dt>
              <dd className="text-right">{branch.oncall_covered ? "covered" : "gap"}</dd>
              <dt>κ after</dt>
              <dd className="text-right">{branch.kappa_after == null ? "—" : Number(branch.kappa_after).toFixed(3)}</dd>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
