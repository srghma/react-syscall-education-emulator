import type { MicroStep } from "@/types/emulator";

interface MicroStepAuditProps {
  steps: MicroStep[];
  instructionName: string;
}

export default function MicroStepAudit({
  steps,
  instructionName,
}: MicroStepAuditProps) {
  if (steps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500 font-sans">
        Step through or execute{" "}
        <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
          {instructionName}
        </span>{" "}
        to observe internal CPU micro-operations and silicon privilege
        transitions.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Silicon Hardware Micro-Ops ({steps.length} Steps)
        </h4>
        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
          TRAP DISPATCHED
        </span>
      </div>

      <div className="space-y-2">
        {steps.map((st) => (
          <div
            key={st.stepNumber}
            className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 space-y-1"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                Phase {st.stepNumber}: {st.description}
              </span>
              <div className="flex gap-1">
                {st.affectedComponents.map((comp) => (
                  <span
                    key={comp}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                  >
                    {comp}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
              {st.hardwareAction}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
