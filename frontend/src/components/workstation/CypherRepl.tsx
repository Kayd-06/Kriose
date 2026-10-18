"use client";

import { useState } from "react";
import { INK } from "./chrome";
import type { Session } from "./useWorkstation";

export function CypherRepl({ session }: { session: Session }) {
  const [text, setText] = useState("MATCH (n) RETURN n.id AS id, labels(n)[0] AS kind LIMIT 25");
  const [fault, setFault] = useState("");
  if (!session.cypherOpen) return null;
  return (
    <form
      className="absolute bottom-24 right-4 z-40 flex w-[420px] flex-col border"
      style={{ background: INK.rack, borderColor: INK.line, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.04)" }}
      onSubmit={(event) => {
        event.preventDefault();
        setFault("");
        void session.submitCypher(text).catch((err: unknown) => setFault(err instanceof Error ? err.message : "query failed"));
      }}
    >
      <div className="flex items-center justify-between border-b px-2 py-1" style={{ borderColor: INK.line }}>
        <span className="font-mono text-[10px] tracking-wider">CYPHER REPL · {session.graph?.graph ?? "NO GRAPH"}</span>
        <button type="button" className="font-mono text-[10px] text-[#8B93A7]" onClick={() => session.setCypherOpen(false)}>
          [CLOSE]
        </button>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        className="h-28 resize-none bg-transparent p-2 font-mono text-[11px] outline-none"
      />
      {fault && <div className="px-2 pb-1 font-mono text-[10px] text-[#F43F5E]">{fault}</div>}
      <div className="flex justify-end border-t px-2 py-1" style={{ borderColor: INK.line }}>
        <button type="submit" className="font-mono text-[10px] text-[#38BDF8]">
          EXECUTE
        </button>
      </div>
    </form>
  );
}
