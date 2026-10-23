"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@/components/workstation/useWorkstation";
import { demoActive } from "@/services/falkorClient";
import { resetDemoRun } from "@/services/demoBackend";
import { Logo } from "./Logo";
import { buildStory, candidateFixes, personName, shortName, type FixStory, type StepState } from "./storyModel";

// Single source of colour for the friendly UI. Mirrors the CSS variables in globals.css.
export const TONE = {
  bg: "#0B0D12",
  card: "#161A24",
  cardHi: "#1D2230",
  line: "#2E3546",
  text: "#F1F4F9",
  sub: "#B4BCCB",
  mute: "#7A8399",
  accent: "#7C8CFF",
  green: "#34D399",
  amber: "#FBBF24",
  red: "#F87171",
};

/** One meaning per colour, everywhere. */
export const STATUS = {
  chosen: { color: TONE.green, label: "Chosen", hint: "survived every test and was applied" },
  skipped: { color: TONE.amber, label: "Skipped", hint: "broke things before, not re-tried" },
  vetoed: { color: TONE.red, label: "Rejected", hint: "failed the stress test" },
  testing: { color: TONE.accent, label: "Testing", hint: "running on a copy right now" },
};

const REVEAL_MS = 750;

/** Reveal run events one by one so a fast backend still reads like a story. */
function useRevealed<T>(items: T[]): T[] {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (items.length === 0) {
      setCount(0);
      return;
    }
    if (count >= items.length) return;
    const timer = window.setTimeout(() => setCount((value) => value + 1), count === 0 ? 150 : REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [items.length, count]);
  return items.slice(0, Math.min(count, items.length));
}

export function StoryView({ session, onAdvanced }: { session: Session; onAdvanced: () => void }) {
  const before = session.runBaseline ?? session.graph;
  const shown = useRevealed(session.runEvents);
  const story = useMemo(() => buildStory(before, shown), [before, shown]);
  const running = session.busy === "SWARM" || (session.runEvents.length > 0 && shown.length < session.runEvents.length);
  const started = session.runEvents.length > 0 || session.busy === "SWARM";
  const done = story.finished && !running;

  const alert = before?.nodes.find((node) => node.id === session.alertId) ?? null;
  const focus = before?.nodes.find((node) => node.id === session.focusId) ?? null;
  const owner = before && focus ? before.edges.find((edge) => edge.type === "OWNS" && edge.target === focus.id) : null;
  const ownerName = personName(before, owner?.source ?? null);
  const load = focus?.current_load ?? null;
  const cap = focus?.max_capacity ?? null;
  const pct = load !== null && cap ? Math.round((load / cap) * 100) : null;
  const afterFocus = session.graph?.nodes.find((node) => node.id === session.focusId) ?? null;
  const afterPct = done && afterFocus?.current_load != null && afterFocus.max_capacity ? Math.round((afterFocus.current_load / afterFocus.max_capacity) * 100) : null;
  const fixes = story.fixes.length ? story.fixes : candidateFixes(before).map((fix) => buildStory(before, []).fixes.find((item) => item.id === fix.id)!);
  const step = !started ? 2 : done ? 3 : 2;

  const run = () => {
    if (demoActive()) resetDemoRun();
    void session.execute();
  };

  const [hero, setHero] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem("kriose.heroSeen") !== "1" && !new URLSearchParams(window.location.search).has("demo")) setHero(true);
  }, []);
  const startFromHero = () => {
    window.localStorage.setItem("kriose.heroSeen", "1");
    setHero(false);
    window.setTimeout(run, 500);
  };

  if (hero) return <Hero onStart={startFromHero} onSkip={() => { window.localStorage.setItem("kriose.heroSeen", "1"); setHero(false); }} ready={Boolean(session.graph && session.alertId)} />;

  if (!session.graph) {
    return (
      <div className="mx-auto mt-24 max-w-xl text-center" style={{ color: TONE.sub }}>
        <div className="text-[18px]" style={{ color: TONE.text }}>Loading the demo incident…</div>
        <p className="mt-3 text-[14px]">
          If this takes more than a few seconds, the API is up but has no data yet. Run{" "}
          <code className="font-mono">curl -X POST http://localhost:8000/api/v2/seed</code> and refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-6">
      <Stepper step={step} />

      <section className="mt-6 rounded-2xl border p-6" style={{ background: TONE.card, borderColor: `${TONE.red}55` }}>
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: TONE.red }}>
          <span className="relative flex h-2.5 w-2.5">
            {!done && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: TONE.red }} />}
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: TONE.red }} />
          </span>
          {alert?.severity ? `${alert.severity.toLowerCase()} alert` : "Alert"}
        </div>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight" style={{ color: TONE.text }}>
          {focus ? focus.name : "A service"} is {pct !== null ? <>at <span className="font-mono" style={{ color: TONE.red }}>{pct}%</span> of capacity</> : "in trouble"} and slowing everything that depends on it.
        </h2>
        {pct !== null && (
          <div className="mt-4 h-2.5 w-full max-w-md overflow-hidden rounded-full" style={{ background: TONE.line }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 85 ? TONE.red : TONE.amber }} />
          </div>
        )}
        <p className="mt-3 text-[14px]" style={{ color: TONE.sub }}>
          {alert?.title}
          {ownerName ? ` · on call: ${ownerName}` : ""}
        </p>
      </section>

      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-semibold" style={{ color: TONE.text }}>
            The runbook has {fixes.length} possible fixes
          </h3>
          <p className="text-[14px]" style={{ color: TONE.sub }}>
            Before anyone hits restart, Kriose checks whether each fix broke things last time, then tries it on a copy of the system and stress-tests the copy.
          </p>
        </div>
        {!started && (
          <button
            type="button"
            onClick={run}
            disabled={session.busy !== null || !session.alertId}
            className="shrink-0 rounded-xl px-5 py-3 text-[15px] font-semibold shadow-lg transition hover:brightness-110 disabled:opacity-50"
            style={{ background: TONE.accent, color: "#0B0D12" }}
          >
            ▶ Test the {fixes.length} fixes
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {fixes.map((fix, index) => (
          <FixCard key={fix.id} fix={fix} index={index} />
        ))}
      </div>

      <Legend />

      {story.stress && (
        <p className="mt-3 text-[13px]" style={{ color: TONE.mute }}>
          Stress test = {Math.round((story.stress.loadFactor - 1) * 100)}% more traffic, +{story.stress.latencyMs} ms latency
          {story.stress.oncallDown ? `, and ${personName(before, story.stress.oncallDown)} (on call) unreachable` : ""}.
        </p>
      )}

      {done && story.chosen && (
        <section className="story-in mt-8 rounded-2xl border p-6" style={{ background: `${TONE.green}12`, borderColor: `${TONE.green}66` }}>
          <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: TONE.green }}>
            The safe choice
          </div>
          <h3 className="mt-1 text-[22px] font-semibold" style={{ color: TONE.text }}>
            {story.chosen.short}: {story.chosen.name}
          </h3>
          <ul className="mt-3 space-y-1.5 text-[14px]" style={{ color: TONE.sub }}>
            <li>✓ No record of it causing an outage before.</li>
            <li>✓ It survived the stress test on a copy of the system{story.chosen.survival !== null ? ` (${Math.round(story.chosen.survival * 100)}% of checks passed)` : ""}.</li>
            <li>
              ✓ Applied to the live graph
              {afterPct !== null && pct !== null ? `: ${focus?.name} went from ${pct}% to ${afterPct}% of capacity` : ""}.
            </li>
            <li>✓ Remembered, so next time Kriose starts with this fix and skips the ones that failed.</li>
          </ul>
        </section>
      )}
      {done && !story.chosen && (
        <section className="story-in mt-8 rounded-2xl border p-6" style={{ background: `${TONE.red}12`, borderColor: `${TONE.red}66`, color: TONE.text }}>
          No fix survived the stress test, so Kriose changed nothing. Every failure was recorded so it won&apos;t be retried blindly.
        </section>
      )}

      <NextStep
        started={started}
        done={done}
        running={running}
        onRun={run}
        onAdvanced={onAdvanced}
        disabled={session.busy !== null || !session.alertId}
      />
    </div>
  );
}

function Hero({ onStart, onSkip, ready }: { onStart: () => void; onSkip: () => void; ready: boolean }) {
  return (
    <div className="relative mx-auto flex min-h-[80vh] max-w-4xl flex-col items-center justify-center px-6 text-center">
      <div className="pointer-events-none absolute inset-0 -z-0 opacity-60" style={{ background: `radial-gradient(600px 300px at 50% 35%, ${TONE.accent}33, transparent 70%)` }} />
      <div className="fade-up relative">
        <Logo size={44} wordmark={false} />
      </div>
      <h1 className="fade-up relative mt-6 text-[44px] font-semibold leading-[1.08] tracking-tight md:text-[56px]" style={{ color: TONE.text, animationDelay: "80ms" }}>
        Before you hit restart,
        <br />
        <span style={{ color: TONE.accent }}>know if it&apos;ll make things worse.</span>
      </h1>
      <p className="fade-up relative mt-5 max-w-2xl text-[17px] leading-relaxed" style={{ color: TONE.sub, animationDelay: "160ms" }}>
        Kriose remembers which fixes broke things last time, tries every fix on a copy of your system, stress-tests the copy, and only applies the one that survives.
      </p>
      <div className="fade-up relative mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: "240ms" }}>
        <button type="button" onClick={onStart} disabled={!ready} className="rounded-xl px-6 py-3.5 text-[16px] font-semibold shadow-lg transition hover:brightness-110 disabled:opacity-60" style={{ background: TONE.accent, color: "#0B0D12", boxShadow: `0 10px 30px -10px ${TONE.accent}` }}>
          {ready ? "See it handle an incident →" : "Loading the demo incident…"}
        </button>
        <button type="button" onClick={onSkip} className="rounded-xl border px-5 py-3.5 text-[15px] font-medium" style={{ borderColor: TONE.line, color: TONE.sub }}>
          Skip intro
        </button>
      </div>
      <div className="fade-up relative mt-12 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3" style={{ animationDelay: "320ms" }}>
        {[
          ["1", "Remembers", "Fixes that caused outages before are skipped, even ones seen at other companies."],
          ["2", "Rehearses", "Each remaining fix runs on a sandbox copy, then gets hit with a traffic spike."],
          ["3", "Decides", "Only a fix that survives is applied, and the result is remembered."],
        ].map(([n, title, body]) => (
          <div key={n} className="rounded-xl border p-4" style={{ borderColor: TONE.line, background: TONE.card }}>
            <div className="text-[13px] font-semibold" style={{ color: TONE.accent }}>{n} · {title}</div>
            <div className="mt-1 text-[13px]" style={{ color: TONE.sub }}>{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px]" style={{ color: TONE.mute }}>
      {Object.values(STATUS).map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          <span style={{ color: TONE.sub }}>{item.label}</span> {item.hint}
        </span>
      ))}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Read the alert", "Test the fixes", "See the safe choice"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-[13px]">
      {steps.map((label, index) => {
        const n = index + 1;
        const state = n < step ? "done" : n === step ? "now" : "next";
        const color = state === "next" ? TONE.mute : state === "now" ? TONE.accent : TONE.green;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border text-[12px] font-semibold" style={{ borderColor: color, color, background: state === "now" ? `${TONE.accent}22` : "transparent" }}>
              {state === "done" ? "✓" : n}
            </span>
            <span style={{ color: state === "next" ? TONE.mute : TONE.text }}>{label}</span>
            {n < steps.length && <span className="mx-1 h-px w-8" style={{ background: TONE.line }} />}
          </li>
        );
      })}
    </ol>
  );
}

const PHASE: Record<FixStory["phase"], { label: string; color: string }> = {
  waiting: { label: "Not tested yet", color: TONE.mute },
  memory: { label: "Checking memory…", color: TONE.accent },
  sandbox: { label: "Trying it on a copy…", color: TONE.accent },
  stress: { label: "Stress-testing the copy…", color: TONE.accent },
  skipped: { label: STATUS.skipped.label, color: STATUS.skipped.color },
  vetoed: { label: STATUS.vetoed.label, color: STATUS.vetoed.color },
  passed: { label: "Passed", color: STATUS.chosen.color },
  chosen: { label: STATUS.chosen.label, color: STATUS.chosen.color },
};

function FixCard({ fix, index }: { fix: FixStory; index: number }) {
  const phase = PHASE[fix.phase];
  const busy = fix.phase === "memory" || fix.phase === "sandbox" || fix.phase === "stress";
  return (
    <article
      className="lift fade-up flex flex-col rounded-2xl border p-5"
      style={{ background: TONE.card, borderColor: busy ? TONE.accent : fix.phase === "waiting" ? TONE.line : `${phase.color}88`, boxShadow: busy ? `0 0 0 3px ${TONE.accent}22, 0 12px 30px -12px ${TONE.accent}55` : fix.phase === "chosen" ? `0 12px 30px -14px ${TONE.green}88` : undefined, animationDelay: `${index * 90}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[17px] font-semibold" style={{ color: TONE.text }}>{fix.short}</span>
        <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ color: phase.color, background: `${phase.color}1F` }}>
          {busy && <span className="mr-1 inline-block animate-spin">◌</span>}
          {phase.label}
        </span>
      </div>
      <p className="mt-1 min-h-[40px] text-[13px]" style={{ color: TONE.sub }}>{fix.name}</p>
      <ul className="mt-4 space-y-2 text-[13px]">
        <Step state={fix.steps.memory} label="Did it break things before?" />
        <Step state={fix.steps.sandbox} label="Try it on a copy" />
        <Step state={fix.steps.stress} label="Stress-test the copy" />
      </ul>
      {fix.reason && (
        <p className="story-in mt-4 rounded-lg p-3 text-[13px]" style={{ background: `${phase.color}14`, color: TONE.text }}>
          {fix.reason}
        </p>
      )}
      {fix.phase === "chosen" && !fix.reason && (
        <p className="story-in mt-4 rounded-lg p-3 text-[13px]" style={{ background: `${TONE.green}14`, color: TONE.text }}>
          Survived the stress test with every safety check passing.
        </p>
      )}
    </article>
  );
}

function Step({ state, label }: { state: StepState; label: string }) {
  const icon = { todo: "○", active: "◌", ok: "✓", fail: "✕", skip: "–" }[state];
  const color = { todo: TONE.mute, active: TONE.accent, ok: TONE.green, fail: state === "fail" ? TONE.red : TONE.red, skip: TONE.mute }[state];
  return (
    <li className="flex items-center gap-2" style={{ color: state === "todo" || state === "skip" ? TONE.mute : TONE.text }}>
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-bold ${state === "active" ? "animate-spin" : ""}`} style={{ color, border: `1px solid ${color}` }}>
        {icon}
      </span>
      <span className={state === "skip" ? "line-through" : ""}>{label}</span>
    </li>
  );
}

function NextStep({ started, done, running, onRun, onAdvanced, disabled }: { started: boolean; done: boolean; running: boolean; onRun: () => void; onAdvanced: () => void; disabled: boolean }) {
  let title = "Next step: test the fixes";
  let body = "Kriose will check its memory, then try each fix on a sandbox copy and stress-test it. Nothing touches the real system until a fix survives.";
  if (running) {
    title = "Testing…";
    body = "Watch each card: memory check, sandbox copy, stress test.";
  } else if (done) {
    title = "Next step: run it again, or look under the hood";
    body = "Run it again and Kriose starts from what it just learned. The advanced view shows the system map, the sandbox copies, and the maths behind each decision.";
  }
  return (
    <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5" style={{ background: TONE.cardHi, borderColor: TONE.line }}>
      <div className="max-w-2xl">
        <div className="text-[15px] font-semibold" style={{ color: TONE.text }}>{title}</div>
        <p className="mt-1 text-[13px]" style={{ color: TONE.sub }}>{body}</p>
      </div>
      <div className="flex gap-2">
        {!started && (
          <button type="button" onClick={onRun} disabled={disabled} className="rounded-xl px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50" style={{ background: TONE.accent, color: "#0B0D12" }}>
            Test the fixes
          </button>
        )}
        {done && (
          <button type="button" onClick={onRun} disabled={disabled} className="rounded-xl border px-4 py-2.5 text-[14px] font-semibold" style={{ borderColor: TONE.accent, color: TONE.accent }}>
            ↻ Run it again
          </button>
        )}
        <button type="button" onClick={onAdvanced} className="rounded-xl border px-4 py-2.5 text-[14px] font-semibold" style={{ borderColor: TONE.line, color: TONE.text }}>
          Advanced view →
        </button>
      </div>
    </section>
  );
}

export { shortName };
