"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";
import { useLeanEmulator } from "@/hooks/useLeanEmulator";
import RegisterView from "./RegisterView";
import SpecialRegistersView from "./SpecialRegistersView";
import StackView from "./StackView";
import MicroStepAudit from "./MicroStepAudit";
import TerminalOutput from "./TerminalOutput";
import CpuStatusFlags from "./CpuStatusFlags";
import AssemblyEditor from "./AssemblyEditor";

interface EmulatorDebuggerProps {
  initialInstructionId?: string;
}

export default function EmulatorDebugger({
  initialInstructionId = "syscall",
}: EmulatorDebuggerProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [selectedId, setSelectedId] = useState(initialInstructionId);
  const currentSpec =
    INSTRUCTIONS_DATA.find((i) => i.id === selectedId) ?? INSTRUCTIONS_DATA[0];

  const {
    sourceCode,
    setSourceCode,
    machine,
    programResult,
    canStepBack,
    privilegeDisplay,
    handleStep,
    handleStepBack,
    handleRunAll,
    handleReset,
    handleArchChange,
  } = useLeanEmulator(currentSpec.arch, currentSpec.defaultProgram);

  const lines = sourceCode.split("\n");

  const onSelectChange = (newId: string) => {
    if (pathname.startsWith("/instructions/")) {
      router.push(`/instructions/${newId}`);
    } else {
      setSelectedId(newId);
      const spec =
        INSTRUCTIONS_DATA.find((i) => i.id === newId) ?? INSTRUCTIONS_DATA[0];
      handleArchChange(spec.arch, spec.defaultProgram);
    }
  };

  const registersRecord: Record<string, bigint> = Object.fromEntries(
    Array.from(machine.registers.entries()).map(([k, v]) => [k, v.val]),
  );

  const specialRegistersRecord: Record<string, string | bigint> =
    Object.fromEntries(machine.specialRegisters.entries());

  const stackItems = machine.stack.map((s) => ({
    address: s.address.val,
    value: s.value.val,
    label: s.tag,
  }));

  const microSteps = machine.microSteps.map((m) => ({
    stepNumber: m.phase,
    description: m.name,
    hardwareAction: m.hardwareAction,
    affectedComponents: [...m.modifiedBuses],
  }));

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="instruction-select"
            className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
          >
            Target Trap:
          </label>
          <select
            id="instruction-select"
            value={selectedId}
            onChange={(e) => onSelectChange(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold font-mono rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {INSTRUCTIONS_DATA.map((item) => (
              <option key={item.id} value={item.id}>
                {item.mnemonic} &mdash; {item.archDisplay} (
                {item.yearIntroduced})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Step Back Button */}
          <button
            type="button"
            onClick={handleStepBack}
            disabled={!canStepBack}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-30 text-zinc-700 dark:text-zinc-200 transition-colors flex items-center gap-1.5"
          >
            <span>&#8630;</span> Step Back
          </button>

          {/* Step Next Button */}
          <button
            type="button"
            onClick={handleStep}
            disabled={machine.isHalted || programResult.tag === "error"}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>&rarr;</span> Step Next
          </button>

          {/* Run to End Button */}
          <button
            type="button"
            onClick={() => handleRunAll(100)}
            disabled={machine.isHalted || programResult.tag === "error"}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shadow-sm transition-colors"
          >
            Run to End
          </button>

          {/* Reset CPU Button */}
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
          >
            Reset CPU
          </button>
        </div>
      </div>

      {/* Assembly Diagnostic Error */}
      {programResult.tag === "error" && (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-600 dark:text-red-400 font-mono">
          Assembly Fault: {programResult.error}
        </div>
      )}

      {/* Main Grid: Code Editor on Left, Live Machine State on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Colorized Non-Scrollable Assembly Editor & Console */}
        <div className="lg:col-span-5 space-y-4">
          <AssemblyEditor
            code={sourceCode}
            onChange={setSourceCode}
            activeLineIndex={machine.activeLineIndex}
            isHalted={machine.isHalted}
            arch={machine.arch}
          />

          <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 font-mono text-xs space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-sans font-bold">
              Active Instruction Pointer
            </div>
            <div className="text-emerald-600 dark:text-emerald-400 font-bold truncate">
              {machine.activeLineIndex >= 0 && lines[machine.activeLineIndex]
                ? `> ${lines[machine.activeLineIndex].trim()}`
                : machine.isHalted
                  ? "(Execution Halted)"
                  : "(Ready to Execute)"}
            </div>
          </div>

          <TerminalOutput trace={machine.trace} />
        </div>

        {/* Right Column: Flags, Registers with ABI Roles, Hardware Micro-Ops, and Stack */}
        <div className="lg:col-span-7 space-y-4">
          <CpuStatusFlags
            arch={machine.arch}
            flags={machine.flags}
            isHalted={machine.isHalted}
            exitCode={machine.exitCode}
            stepCount={machine.stepCount}
          />
          <RegisterView registers={registersRecord} arch={machine.arch} />
          <SpecialRegistersView
            specialRegisters={specialRegistersRecord}
            privilege={privilegeDisplay}
          />
          <MicroStepAudit
            steps={microSteps}
            instructionName={currentSpec.mnemonic}
          />
          <StackView stack={stackItems} />
        </div>
      </div>
    </div>
  );
}
