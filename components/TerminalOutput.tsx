"use client";

import { useEffect, useRef, useState } from "react";
import type { TraceEvent } from "@/types/emulator";

interface TerminalOutputProps {
  trace: readonly TraceEvent[];
}

export default function TerminalOutput({ trace }: TerminalOutputProps) {
  const [filter, setFilter] = useState<"all" | "stdout" | "kernel_log">("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredTrace = trace.filter((item) => {
    if (filter === "all") return true;
    return item.stream === filter;
  });

  // Auto-scroll to latest output on new trace events
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  return (
    <div className="rounded-xl border border-zinc-900 bg-black text-zinc-100 p-4 font-mono text-xs shadow-lg space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-zinc-400 text-[11px]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="ml-2 font-sans font-semibold text-zinc-200">
            Console & Syscall Trace
          </span>
        </div>

        <div className="flex items-center gap-1 font-sans">
          {(["all", "stdout", "kernel_log"] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                filter === tab
                  ? "bg-zinc-800 text-zinc-100 font-bold"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "kernel_log" ? "Kernel" : tab}
            </button>
          ))}
          <span className="ml-2 text-[10px] text-zinc-600">
            {filteredTrace.length} Events
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-[120px] max-h-[200px] overflow-y-auto space-y-1.5 text-[11px] select-text"
      >
        {filteredTrace.length === 0 ? (
          <div className="text-zinc-600 italic">No output written yet.</div>
        ) : (
          filteredTrace.map((item, idx) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: log trace is append-only
              key={idx}
              className={`leading-relaxed whitespace-pre-wrap ${
                item.stream === "stdout"
                  ? "text-emerald-400 font-medium"
                  : item.stream === "stderr"
                    ? "text-red-400 font-medium"
                    : "text-amber-300"
              }`}
            >
              {item.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
