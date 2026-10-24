"use client";

import { useRef, useState } from "react";
import { importSystem } from "@/services/falkorClient";
import { TONE } from "./StoryView";

const TEMPLATE = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/templates/kriose-system.yaml`;
const SPANS = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/templates/otel-spans.json`;

export function ImportPanel({ onClose, onLoaded }: { onClose: () => void; onLoaded: (tenant: string, estimated: boolean) => void }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const loadSample = async (url: string) => {
    setErrors([]);
    setText(await (await fetch(url)).text());
  };
  const submit = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const { tenant, estimated } = await importSystem(text);
      onLoaded(tenant, estimated);
    } catch (err) {
      const list = (err as { errors?: string[] }).errors;
      setErrors(list?.length ? list : [err instanceof Error ? err.message : "Something went wrong."]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#0008" }} role="dialog" aria-modal="true" aria-label="Try your own system">
      <div className="fade-up w-full max-w-3xl rounded-2xl border p-6 shadow-2xl" style={{ background: TONE.card, borderColor: TONE.line }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold" style={{ color: TONE.text }}>Try it on your own system</h2>
            <p className="mt-1 text-[14px]" style={{ color: TONE.sub }}>
              Describe your services (load and capacity), what calls what, who owns them, the fixes in your runbook, and the alert that is firing. YAML or JSON. OTel spans work too.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[20px] leading-none" style={{ color: TONE.mute }} aria-label="Close">×</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          <button type="button" onClick={() => void loadSample(TEMPLATE)} className="lift rounded-lg border px-3 py-1.5" style={{ borderColor: TONE.line, color: TONE.text }}>Use the sample</button>
          <a href={TEMPLATE} download className="lift rounded-lg border px-3 py-1.5" style={{ borderColor: TONE.line, color: TONE.text }}>↓ Download template</a>
          <button type="button" onClick={() => void loadSample(SPANS)} className="lift rounded-lg border px-3 py-1.5" style={{ borderColor: TONE.line, color: TONE.text }}>Example: OTel spans</button>
          <button type="button" onClick={() => file.current?.click()} className="lift rounded-lg border px-3 py-1.5" style={{ borderColor: TONE.line, color: TONE.text }}>Upload a file…</button>
          <input
            ref={file}
            type="file"
            accept=".yaml,.yml,.json,application/json,text/yaml"
            className="hidden"
            onChange={async (event) => {
              const picked = event.target.files?.[0];
              if (picked) setText(await picked.text());
              event.target.value = "";
            }}
          />
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          placeholder={"name: My Shop\nalert: { title: Cart API p99 > 2s, service: cart }\nservices:\n  - { id: cart, load: 90, capacity: 100, owner: dev }\n..."}
          className="mt-3 h-72 w-full resize-y rounded-xl border p-3 font-mono text-[12.5px] outline-none"
          style={{ background: TONE.bg, borderColor: errors.length ? TONE.red : TONE.line, color: TONE.text }}
          aria-label="System description"
        />
        {errors.length > 0 && (
          <div className="mt-3 rounded-xl border p-3 text-[13px]" style={{ borderColor: `${TONE.red}66`, background: `${TONE.red}12`, color: TONE.text }} role="alert">
            <div className="font-semibold" style={{ color: TONE.red }}>A few things to fix first:</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {errors.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[12px]" style={{ color: TONE.mute }}>Stays in your browser in the hosted demo. With the API running it becomes its own tenant graph.</p>
          <button type="button" onClick={() => void submit()} disabled={busy || !text.trim()} className="shrink-0 rounded-xl px-5 py-2.5 text-[14px] font-semibold disabled:opacity-50" style={{ background: TONE.accent, color: "#0B0D12" }}>
            {busy ? "Loading…" : "Load my system"}
          </button>
        </div>
      </div>
    </div>
  );
}
