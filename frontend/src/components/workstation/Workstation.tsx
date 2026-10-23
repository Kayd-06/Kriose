"use client";

import { useEffect } from "react";
import { CompilerModal } from "./CompilerModal";
import { CypherRepl } from "./CypherRepl";
import { Inspector } from "./Inspector";
import { InstrumentBar } from "./InstrumentBar";
import { McGtsDock } from "./McGtsDock";
import { SchematicCanvas } from "./SchematicCanvas";
import { SwarmRack } from "./SwarmRack";
import { TimeRuler } from "./TimeRuler";
import { VerdictBar } from "./VerdictBar";
import { useWorkstation } from "./useWorkstation";

export default function Workstation() {
  const session = useWorkstation();

  useEffect(() => {
    let downAt = 0;
    const down = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        downAt = performance.now();
      }
      if (event.key === "1") session.setLens(1);
      if (event.key === "2") session.setLens(2);
      if (event.key === "3") session.setLens(3);
      if (event.key === "4") session.setLens(4);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        session.setCompilerOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        session.setCypherOpen(true);
      }
      if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey) void session.surgery();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space" && !typing(event.target) && performance.now() - downAt < 220) void session.execute();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [session]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#060709] text-[#E2E8F0]">
      <InstrumentBar session={session} />
      <VerdictBar session={session} />
      <div className="flex min-h-0 flex-1">
        <SwarmRack session={session} />
        <div className="relative flex min-w-0 flex-1 overflow-hidden">
          <SchematicCanvas session={session} />
          <CypherRepl session={session} />
        </div>
        <Inspector session={session} />
      </div>
      <McGtsDock session={session} />
      <TimeRuler session={session} />
      <CompilerModal session={session} />
    </div>
  );
}

function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT";
}
