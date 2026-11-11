interface StackItem {
  address: bigint;
  value: bigint;
  label?: string;
}

export default function StackView({ stack }: { stack: StackItem[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Memory / Stack Frame View
        </h4>
        <span className="text-[10px] font-mono text-zinc-500">
          TSS / Hardware Stack ({stack.length} slots)
        </span>
      </div>

      {stack.length === 0 ? (
        <div className="text-xs text-zinc-500 font-mono italic p-3 text-center">
          Stack empty or unchanged
        </div>
      ) : (
        <div className="space-y-1.5 font-mono text-xs">
          {stack.map((item, idx) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: composite key prevents collisions when multiple trap frames share memory addresses
              key={`${item.address.toString(16)}-${idx}`}
              className="flex items-center justify-between p-2 rounded bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-[11px]"
            >
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">
                  0x{item.address.toString(16)}:
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  0x{item.value.toString(16)}
                </span>
              </div>
              {item.label && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-sans font-medium">
                  {item.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
