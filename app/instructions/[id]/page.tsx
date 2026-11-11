import { notFound } from "next/navigation";
import Link from "next/link";
import { INSTRUCTIONS_DATA, getInstructionById } from "@/lib/instruction-data";
import EmulatorDebugger from "@/components/EmulatorDebugger";

export function generateStaticParams() {
  return INSTRUCTIONS_DATA.map((item) => ({ id: item.id }));
}

export default async function InstructionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const spec = getInstructionById(id);

  if (!spec) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/" className="hover:underline">
          Matrix
        </Link>
        <span>/</span>
        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
          {spec.mnemonic}
        </span>
      </div>

      {/* Instruction Specification Card */}
      <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {spec.mnemonic}
              </h1>
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {spec.archDisplay}
              </span>
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">{spec.fullName}</p>
          </div>

          <div className="text-right font-mono text-xs">
            <div className="font-bold text-zinc-900 dark:text-zinc-100">
              Introduced: {spec.yearIntroduced}
            </div>
            <div className="text-zinc-500 text-[11px]">{spec.era}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block font-sans">
              Privilege Transition
            </span>
            <div className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
              {spec.sourcePrivilege} &rarr; {spec.targetPrivilege}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block font-sans">
              Return Instruction
            </span>
            <div className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">
              {spec.returnInstruction}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block font-sans">
              Assembler Syntax Dialect
            </span>
            <div className="mt-1 text-[11px] text-zinc-700 dark:text-zinc-300 font-sans">
              {spec.assemblerType}
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans">
          {spec.summary}
        </p>
      </div>

      {/* Live Interactive Debugger Loaded with this Instruction */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          Live Debugger & State Emulator
        </h2>
        <EmulatorDebugger initialInstructionId={spec.id} />
      </div>
    </div>
  );
}
