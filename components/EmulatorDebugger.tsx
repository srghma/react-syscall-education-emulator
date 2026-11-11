"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";
import { useLeanEmulator } from "@/hooks/useLeanEmulator";
import { type Arch, privilegeToString } from "@/lib/lean/domain";
import RegisterView from "./RegisterView";
import SpecialRegistersView from "./SpecialRegistersView";
import StackView from "./StackView";
import MicroStepAudit from "./MicroStepAudit";
import TerminalOutput from "./TerminalOutput";
import CpuStatusFlags from "./CpuStatusFlags";
import AssemblyEditor from "./AssemblyEditor";
import MemoryHexdump from "./MemoryHexdump";

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
    arch,
    sourceCode,
    setSourceCode,
    machine,
    programResult,
    canStepBack,
    handleStep,
    handleStepBack,
    handleRunAll,
    handleReset,
    handleArchChange,
  } = useLeanEmulator(
    currentSpec.arch,
    currentSpec.defaultProgram,
    currentSpec.sourcePrivilege,
  );

  const lines = sourceCode.split("\n");

  const onInstructionChange = (newId: string) => {
    if (pathname.startsWith("/instructions/")) {
      router.push(`/instructions/${newId}`);
    } else {
      setSelectedId(newId);
      const spec =
        INSTRUCTIONS_DATA.find((i) => i.id === newId) ?? INSTRUCTIONS_DATA[0];
      handleArchChange(spec.arch, spec.defaultProgram, spec.sourcePrivilege);
    }
  };

  const onArchChange = (nextArch: Arch) => {
    const firstSpec =
      INSTRUCTIONS_DATA.find((i) => i.arch === nextArch) ?? currentSpec;
    setSelectedId(firstSpec.id);
    handleArchChange(
      nextArch,
      firstSpec.defaultProgram,
      firstSpec.sourcePrivilege,
    );
  };

  const registersRecord: Record<string, bigint> = Object.fromEntries(
    Array.from(machine.registers.entries()).map(([k, v]) => [k, v.val]),
  );

  const specialRegistersRecord: Record<string, string | bigint> =
    Object.fromEntries(
      Array.from(machine.specialRegisters.entries()).map(([k, entry]) => [
        k,
        entry.note
          ? `${entry.value.toHex()} (${entry.note})`
          : entry.value.toHex(),
      ]),
    );

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

  const symbols =
    programResult.tag === "ok" ? programResult.value.symbols : new Map();

  return (
    <div className="space-y-6">
      {/* Top Controls with Architecture & Template Selectors */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Architecture Selector */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="arch-select"
              className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
            >
              CPU:
            </label>
            <select
              id="arch-select"
              value={arch}
              onChange={(e) => onArchChange(e.target.value as Arch)}
              className="px-2.5 py-1.5 text-xs font-semibold font-mono rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="x86_64">x86_64 (AMD64)</option>
              <option value="x86_32">x86_32 (IA-32)</option>
              <option value="arm64">ARM64 (AArch64)</option>
              <option value="riscv">RISC-V (RV64)</option>
            </select>
          </div>

          {/* Template Selector */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="instruction-select"
              className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
            >
              Trap Program:
            </label>
            <select
              id="instruction-select"
              value={selectedId}
              onChange={(e) => onInstructionChange(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold font-mono rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {INSTRUCTIONS_DATA.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.mnemonic} &mdash; {item.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStepBack}
            disabled={!canStepBack}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-30 text-zinc-700 dark:text-zinc-200 transition-colors flex items-center gap-1.5"
          >
            <span>&#8630;</span> Step Back
          </button>

          <button
            type="button"
            onClick={handleStep}
            disabled={machine.isHalted || programResult.tag === "error"}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>&rarr;</span> Step Next
          </button>

          <button
            type="button"
            onClick={() => handleRunAll(100)}
            disabled={machine.isHalted || programResult.tag === "error"}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shadow-sm transition-colors"
          >
            Run to End
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
          >
            Reset CPU
          </button>
        </div>
      </div>

      {/* Assembly Diagnostic Banner */}
      {programResult.tag === "error" && (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-600 dark:text-red-400 font-mono">
          [Line {programResult.error.line}] Assembly Error:{" "}
          {programResult.error.message}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Editor, Pointer Status, Hexdump, and Console */}
        <div className="lg:col-span-5 space-y-4">
          <AssemblyEditor
            code={sourceCode}
            onChange={setSourceCode}
            activeLineIndex={machine.activeLineIndex}
            isHalted={machine.isHalted}
            arch={machine.arch}
          />

          <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 font-mono text-xs space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-sans font-bold">
              <span>Next to Execute:</span>
              <span>PC: {machine.pc.toHex()}</span>
            </div>
            <div className="text-emerald-600 dark:text-emerald-400 font-bold truncate">
              {machine.activeLineIndex >= 0 && lines[machine.activeLineIndex]
                ? `> ${lines[machine.activeLineIndex].trim()}`
                : machine.isHalted
                  ? "(Execution Halted)"
                  : "(Ready to Execute)"}
            </div>
          </div>

          <MemoryHexdump memory={machine.memory} symbols={symbols} />
          <TerminalOutput trace={machine.trace} />
        </div>

        {/* Right: State, Flags, Control Registers, Micro-Steps */}
        <div className="lg:col-span-7 space-y-4">
          <CpuStatusFlags
            arch={machine.arch}
            flags={machine.flags}
            isHalted={machine.isHalted}
            exitCode={machine.exitCode}
            haltReason={machine.haltReason}
            stepCount={machine.stepCount}
          />
          <RegisterView registers={registersRecord} arch={machine.arch} />
          <SpecialRegistersView
            specialRegisters={specialRegistersRecord}
            privilege={privilegeToString(machine.privilege)}
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
