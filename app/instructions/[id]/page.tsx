import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { INSTRUCTIONS_DATA, getInstructionById } from "@/lib/instruction-data";
import { privilegeToString } from "@/lib/lean/domain";
import EmulatorDebugger from "@/components/EmulatorDebugger";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";

export const instant = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return INSTRUCTIONS_DATA.map((item) => ({ id: item.id }));
}

async function InstructionDetailContent({ params }: PageProps) {
  const { id } = await params;
  const spec = getInstructionById(id);

  if (!spec) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
        <Link
          href="/"
          className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          Instructions Matrix
        </Link>
        <span>/</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
          {spec.mnemonic}
        </span>
      </nav>

      {/* Header Dossier */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {spec.mnemonic}
              </h1>
              <span className="px-2 py-0.5 text-xs font-mono rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800">
                {spec.archDisplay}
              </span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {spec.fullName}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
              {privilegeToString(spec.sourcePrivilege)}
            </span>
            <span className="text-zinc-400 font-bold">&rarr;</span>
            <span className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
              {privilegeToString(spec.targetPrivilege)}
            </span>
          </div>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          {spec.summary}
        </p>

        {/* Specifications */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs font-mono">
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-sans font-bold">
              Hardware Return Op
            </div>
            <div className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
              {spec.returnInstruction}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-sans font-bold">
              Silicon Era
            </div>
            <div className="text-zinc-800 dark:text-zinc-200 mt-0.5">
              {spec.era} ({spec.yearSiliconShipped})
            </div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-sans font-bold">
              Manual Reference
            </div>
            <div
              className="text-zinc-800 dark:text-zinc-200 truncate mt-0.5"
              title={spec.docsReference}
            >
              {spec.docsReference}
            </div>
          </div>
        </div>

        {/* Register Roles */}
        <div className="pt-2">
          <div className="text-[11px] font-sans font-bold uppercase tracking-wider text-zinc-400 mb-2">
            Architectural Registers & ABI Staging
          </div>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
            {spec.keyRegisters.map((reg) => (
              <span
                key={reg}
                className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
              >
                {reg}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Debugger */}
      <EmulatorDebugger key={spec.id} initialInstructionId={spec.id} />

      {/* Global Diagram with Active Card Glow */}
      <ArchitectureDiagram activeId={spec.id} />
    </div>
  );
}

function InstructionDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
      <div className="h-56 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl" />
      <div className="h-96 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl" />
    </div>
  );
}

export default function InstructionDetailPage(props: PageProps) {
  return (
    <Suspense fallback={<InstructionDetailSkeleton />}>
      <InstructionDetailContent params={props.params} />
    </Suspense>
  );
}
