"use client";

import { useEffect, useState } from "react";
import Workstation from "@/components/workstation/Workstation";
import { useWorkstation } from "@/components/workstation/useWorkstation";
import { StoryView, TONE } from "./StoryView";

type View = "story" | "advanced";

export default function App() {
  const session = useWorkstation();
  const [view, setView] = useState<View>("story");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("view");
    if (param === "advanced" || param === "story") setView(param);
  }, []);

  const choose = (next: View) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "story") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: TONE.bg }}>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: TONE.line, background: TONE.bg }}>
        <div className="flex items-center gap-3">
          <span className="text-[16px] font-bold tracking-tight" style={{ color: TONE.text }}>Kriose</span>
          <span className="hidden text-[13px] md:inline" style={{ color: TONE.mute }}>
            Tests your fixes on a copy before they touch production.
          </span>
        </div>
        <div className="flex rounded-lg border p-0.5 text-[13px]" style={{ borderColor: TONE.line }} role="tablist">
          {(["story", "advanced"] as View[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              onClick={() => choose(item)}
              className="rounded-md px-3 py-1 font-medium transition"
              style={{ background: view === item ? TONE.cardHi : "transparent", color: view === item ? TONE.text : TONE.mute }}
            >
              {item === "story" ? "Story" : "Advanced view"}
            </button>
          ))}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        {view === "story" ? <StoryView session={session} onAdvanced={() => choose("advanced")} /> : <Workstation session={session} />}
      </main>
    </div>
  );
}
