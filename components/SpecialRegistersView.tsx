interface SpecialRegistersProps {
  specialRegisters: Record<string, string | bigint>;
  privilege: string;
}

export default function SpecialRegistersView({
  specialRegisters,
  privilege,
}: SpecialRegistersProps) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Hardware Control, MSRs & System Registers
        </h4>
        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
          {privilege}
        </span>
      </div>

      <div className="space-y-2 font-mono text-xs">
        {Object.entries(specialRegisters).map(([key, val]) => (
          <div
            key={key}
            className="flex items-center justify-between p-2 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800"
          >
            <span className="text-zinc-600 dark:text-zinc-400 font-semibold">
              {key}
            </span>
            <span className="text-zinc-900 dark:text-zinc-100 text-[11px] font-bold">
              {typeof val === "bigint" ? `0x${val.toString(16)}` : val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
