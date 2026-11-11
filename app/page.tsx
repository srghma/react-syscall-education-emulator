import InstructionTable from "@/components/InstructionTable";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";

export default function HomePage() {
  const earliestYear = Math.min(
    ...INSTRUCTIONS_DATA.map((i) => i.yearIntroduced),
  );
  const totalInstructions = INSTRUCTIONS_DATA.length;
  const uniqueArchs = new Set(INSTRUCTIONS_DATA.map((i) => i.arch)).size;

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <span>{totalInstructions} Core Instructions</span> &bull;{" "}
          <span>{uniqueArchs} CPU Architectures</span> &bull;{" "}
          <span>{earliestYear} to Modern Era</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          Hardware Privilege Transitions & Syscall Traps
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-3xl leading-relaxed">
          From legacy x86 interrupt gates (
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            int 0x80
          </code>
          ) and MSR fastpaths (
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            syscall
          </code>
          ,{" "}
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            sysenter
          </code>
          ) to multi-tier ARM exception levels (
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            svc
          </code>
          ,{" "}
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            hvc
          </code>
          ,{" "}
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            smc
          </code>
          ), unified RISC-V (
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            ecall
          </code>
          ), and modern Confidential Computing (
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            tdcall
          </code>
          ,{" "}
          <code className="font-mono text-emerald-600 dark:text-emerald-400">
            seamcall
          </code>
          ).
        </p>
      </div>

      {/* Privilege Hierarchy Visualization */}
      <ArchitectureDiagram />

      {/* Master Matrix */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Instruction & Architecture Comparison Matrix
        </h2>
        <InstructionTable />
      </div>
    </div>
  );
}
