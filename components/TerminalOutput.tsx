import type { TraceEvent } from "@/types/emulator";

export default function TerminalOutput({ trace }: { trace: TraceEvent[] }) {
  return (
    <div className="rounded-xl border border-zinc-900 bg-black text-zinc-100 p-4 font-mono text-xs shadow-lg space-y-2">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-zinc-400 text-[11px]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="ml-2 font-sans font-semibold">
            Console & Syscall Trace
          </span>
        </div>
        <span>{trace.length} Events</span>
      </div>

      <div className="min-h-[100px] max-h-[180px] overflow-y-auto space-y-1 text-[11px]">
        {trace.length === 0 ? (
          <div className="text-zinc-600 italic">No output written yet.</div>
        ) : (
          trace.map((item, idx) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: log trace is append-only
              key={idx}
              className={`leading-relaxed ${item.stream === "stdout"
                  ? "text-emerald-400"
                  : item.stream === "stderr"
                    ? "text-red-400"
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
