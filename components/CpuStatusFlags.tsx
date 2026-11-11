import type { MachineFlags } from "@/lib/lean/state";
import type { Arch } from "@/lib/lean/domain";

interface CpuStatusFlagsProps {
  arch: Arch;
  flags: MachineFlags;
  isHalted: boolean;
  exitCode: number | null;
  haltReason?: string;
  stepCount: number;
}

export default function CpuStatusFlags({
  arch,
  flags,
  isHalted,
  exitCode,
  haltReason,
  stepCount,
}: CpuStatusFlagsProps) {
  const isArm = arch === "arm64";
  const isX86 = arch === "x86_32" || arch === "x86_64";
  const isRiscV = arch === "riscv";

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
          Tick Counter:
        </span>
        <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
          Step #{stepCount}
        </span>
      </div>

      {/* Architectural Condition Flags (RISC-V has no flags register) */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
          {isArm ? "PSTATE.NZCV:" : isX86 ? "EFLAGS:" : "Status Flags:"}
        </span>
        {isRiscV ? (
          <span className="text-[11px] text-zinc-400 font-mono italic">
            None (RISC-V compares registers directly)
          </span>
        ) : (
          <div className="flex items-center gap-1 font-mono text-xs">
            {[
              {
                label: isArm ? "N" : "SF",
                active: flags.N,
                title: "Negative / Sign Flag",
              },
              { label: "ZF", active: flags.Z, title: "Zero Flag" },
              {
                label: "CF",
                active: flags.C,
                title: isArm
                  ? "Carry Flag (not borrow)"
                  : "Carry Flag (borrow)",
              },
              {
                label: isArm ? "V" : "OF",
                active: flags.V,
                title: "Overflow Flag",
              },
            ].map((flag) => (
              <span
                key={flag.label}
                title={flag.title}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                  flag.active
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {flag.label}={flag.active ? "1" : "0"}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Process Exit / Fault Status */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
          Process Status:
        </span>
        {isHalted ? (
          exitCode !== null ? (
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                exitCode === 0
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                  : "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800"
              }`}
            >
              Halted (Exit: {exitCode})
            </span>
          ) : (
            <span
              className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
              title={haltReason}
            >
              Fault: End of .text
            </span>
          )
        ) : (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
            Running (Active)
          </span>
        )}
      </div>
    </div>
  );
}
