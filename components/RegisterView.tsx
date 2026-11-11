interface RegisterViewProps {
  registers: Record<string, bigint>;
}

export default function RegisterView({ registers }: RegisterViewProps) {
  const entries = Object.entries(registers);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          General Purpose Registers
        </h4>
        <span className="text-[10px] font-mono text-zinc-500">
          {entries.length} Registers
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 font-mono text-xs">
        {entries.map(([reg, val]) => {
          const isNonZero = val !== 0n;
          return (
            <div
              key={reg}
              className={`p-2 rounded-lg border transition-colors ${
                isNonZero
                  ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60"
                  : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="text-[10px] text-zinc-500 uppercase">{reg}</div>
              <div
                className={`font-semibold truncate text-[11px] ${
                  isNonZero
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-zinc-800 dark:text-zinc-200"
                }`}
                title={`0x${val.toString(16)} (${val.toString()})`}
              >
                0x{val.toString(16)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
