"use client";

import { useState } from "react";
import { parseComposeYaml, parseTopologyJson, synthesizeScaleFree, type SynthParams } from "@/lib/neuroSymbolicCompiler";
import { INK } from "./chrome";
import type { Session } from "./useWorkstation";

const TABS = ["COMPOSE / YAML", "JSON / CYPHER", "SCALE-FREE"] as const;

export function CompilerModal({ session }: { session: Session }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("COMPOSE / YAML");
  const [source, setSource] = useState("");
  const [cypher, setCypher] = useState("");
  const [tenant, setTenant] = useState(session.graph?.tenant ?? "");
  const [note, setNote] = useState("");
  const [params, setParams] = useState<SynthParams>({ services: 12, engineers: 4, actions: 3, coupling: 0.55, loadVariance: 0.6 });
  if (!session.compilerOpen) return null;

  const publish = (kind: "yaml" | "json" | "synth") => {
    const name = tenant.trim() || `t${Date.now().toString(36)}`;
    try {
      const draft = kind === "yaml" ? parseComposeYaml(source) : kind === "json" ? parseTopologyJson(source) : synthesizeScaleFree(params);
      setNote(draft.note);
      void session.ingest(draft, name);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "parse failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <section className="flex h-[540px] w-[760px] flex-col border" style={{ background: INK.rack, borderColor: INK.line }}>
        <header className="flex h-10 items-center justify-between border-b px-3" style={{ borderColor: INK.line }}>
          <span className="font-mono text-[11px] tracking-wider">INGEST / COMPILER</span>
          <button type="button" className="font-mono text-[10px] text-[#8B93A7]" onClick={() => session.setCompilerOpen(false)}>
            [CLOSE]
          </button>
        </header>
        <div className="flex border-b" style={{ borderColor: INK.line }}>
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className="h-8 px-3 font-mono text-[10px]"
              style={{ color: tab === item ? INK.cyan : INK.mute }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 p-3">
          {tab !== "SCALE-FREE" && (
            <textarea
              value={tab === "COMPOSE / YAML" ? source : tab === "JSON / CYPHER" ? source : ""}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              className="h-full w-full resize-none border bg-transparent p-2 font-mono text-[11px] outline-none"
              style={{ borderColor: INK.line }}
              placeholder={tab === "COMPOSE / YAML" ? "services:" : "{ }"}
            />
          )}
          {tab === "SCALE-FREE" && (
            <div className="space-y-3 font-mono text-[11px]">
              <Range label="SERVICES" min={5} max={50} value={params.services} onChange={(services) => setParams({ ...params, services })} />
              <Range label="ENGINEERS" min={2} max={20} value={params.engineers} onChange={(engineers) => setParams({ ...params, engineers })} />
              <Range label="ACTIONS" min={2} max={8} value={params.actions} onChange={(actions) => setParams({ ...params, actions })} />
              <Range label="COUPLING" min={0} max={1} step={0.01} value={params.coupling} onChange={(coupling) => setParams({ ...params, coupling })} />
              <Range label="LOAD VARIANCE" min={0} max={1} step={0.01} value={params.loadVariance} onChange={(loadVariance) => setParams({ ...params, loadVariance })} />
            </div>
          )}
        </div>
        <footer className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: INK.line }}>
          <input
            value={tenant}
            onChange={(event) => setTenant(event.target.value)}
            placeholder="tenant id"
            className="h-7 w-40 rounded-[2px] border bg-transparent px-2 font-mono text-[11px] outline-none"
            style={{ borderColor: INK.line }}
          />
          {tab === "JSON / CYPHER" && (
            <button
              type="button"
              className="font-mono text-[10px] text-[#8B93A7]"
              onClick={() => {
                setCypher(source);
                if (source.trim()) void session.submitCypher(source).then(() => session.setCompilerOpen(false)).catch((err) => setNote(String(err)));
              }}
            >
              RUN CYPHER
            </button>
          )}
          <button
            type="button"
            className="ml-auto h-7 bg-[#E2E8F0] px-3 font-mono text-[11px] text-[#060709]"
            onClick={() => publish(tab === "COMPOSE / YAML" ? "yaml" : tab === "SCALE-FREE" ? "synth" : "json")}
          >
            MATERIALIZE
          </button>
          <span className="max-w-[220px] truncate font-mono text-[10px] text-[#8B93A7]">{note || cypher.slice(0, 40)}</span>
        </footer>
      </section>
    </div>
  );
}

function Range({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-32 text-[#8B93A7]">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="flex-1" />
      <span className="w-12 text-right tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span>
    </label>
  );
}
