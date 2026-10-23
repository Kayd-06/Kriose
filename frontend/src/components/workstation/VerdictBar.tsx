"use client";

import { INK } from "./chrome";
import type { Session } from "./useWorkstation";

/** Incident header + run verdict. Everything here is derived from the loaded graph and the last swarm run. */
export function VerdictBar({ session }: { session: Session }) {
  const graph = session.graph;
  if (!graph) return null;
  const alert = graph.nodes.find((node) => node.id === session.alertId) ?? null;
  const focus = graph.nodes.find((node) => node.id === session.focusId) ?? null;
  const load = focus?.current_load ?? null;
  const cap = focus?.max_capacity ?? null;
  const ratio = load !== null && cap ? load / cap : null;
  const loadColor = ratio === null ? INK.mute : ratio > 1 ? INK.crimson : ratio >= 0.85 ? INK.amber : INK.emerald;
  const verdict = session.verdict && session.verdict.alertId === session.alertId ? session.verdict : null;
  const running = session.busy === "SWARM";

  return (
    <section
      className="flex min-h-[64px] shrink-0 items-center gap-4 border-b px-4 py-2"
      style={{ background: INK.module, borderColor: INK.line }}
    >
      <div className="min-w-0 max-w-[38%]">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#8B93A7]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: alert ? INK.amber : INK.mute }} />
          Incident {alert ? `· ${alert.id}` : ""} {alert?.severity ? `· ${alert.severity}` : ""} · {graph.tenant}
        </div>
        <div className="truncate text-[16px] font-semibold text-[#E2E8F0]" title={alert ? alert.title || alert.name : undefined}>
          {focus ? focus.name || focus.id : "No alert in this graph"}
          {load !== null && cap !== null && (
            <span className="ml-2 font-mono text-[14px]" style={{ color: loadColor }}>
              {load.toFixed(0)}/{cap.toFixed(0)} load
            </span>
          )}
        </div>
        {alert && <div className="truncate text-[12px] text-[#8B93A7]">{alert.title || alert.name}</div>}
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        {running && <Chip color={INK.cyan} label="Swarm running…" detail="forking futures and shocking them" />}
        {!running && !verdict && alert && (
          <button
            type="button"
            onClick={() => void session.execute()}
            disabled={session.busy !== null}
            className="h-10 rounded border px-4 text-[14px] font-semibold"
            style={{ borderColor: INK.cyan, color: INK.void, background: INK.cyan }}
          >
            ▶ Run the swarm on this incident
          </button>
        )}
        {!running && verdict && (
          <>
            {verdict.winner ? (
              <Chip
                big
                color={INK.emerald}
                label={`Chose ${short(verdict.winner)}`}
                detail={`survival ${verdict.winner.survival.toFixed(2)}${verdict.merged ? " · merged to live graph" : ""}`}
              />
            ) : (
              <Chip big color={INK.crimson} label="No fix survived" detail="every branch was vetoed" />
            )}
            {verdict.skipped.map((item) => (
              <Chip key={`s-${item.id}`} color={INK.amber} label={`Skipped ${short(item)}`} detail={`known dead end: ${item.reason}`} />
            ))}
            {verdict.vetoed.map((item) => (
              <Chip
                key={`v-${item.id}`}
                color={INK.crimson}
                label={`Vetoed ${short(item)}`}
                detail={item.shields.length ? `broke ${item.shields.join(", ")} under stress test` : "failed the stress test"}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function short(item: { id: string; name: string }): string {
  const id = item.id.replace(/^act_/, "");
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function Chip({ color, label, detail, big }: { color: string; label: string; detail: string; big?: boolean }) {
  return (
    <div
      className={`flex max-w-[420px] min-w-0 flex-col rounded border-l-4 px-3 ${big ? "py-1.5" : "py-1"}`}
      style={{ borderColor: color, background: `${color}14` }}
      title={detail}
    >
      <span className={`${big ? "text-[15px]" : "text-[13px]"} font-semibold`} style={{ color }}>
        {label}
      </span>
      <span className="truncate text-[12px] text-[#AEB5C4]">{detail}</span>
    </div>
  );
}
