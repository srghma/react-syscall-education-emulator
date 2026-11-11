"use client";

import { useState } from "react";
import type { MachineState } from "@/types/emulator";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";
import { CODE_EXAMPLES } from "@/lib/emulator/examples";
import { createInitialState, stepEmulator } from "@/lib/emulator/core";
import RegisterView from "./RegisterView";
import SpecialRegistersView from "./SpecialRegistersView";
import StackView from "./StackView";
import MicroStepAudit from "./MicroStepAudit";
import TerminalOutput from "./TerminalOutput";

interface EmulatorDebuggerProps {
  initialInstructionId?: string;
}

export default function EmulatorDebugger({
  initialInstructionId = "syscall",
}: EmulatorDebuggerProps) {
  const [selectedId, setSelectedId] = useState(initialInstructionId);
  const currentSpec =
    INSTRUCTIONS_DATA.find((i) => i.id === selectedId) ?? INSTRUCTIONS_DATA[0];

  const [assemblyCode, setAssemblyCode] = useState(
    CODE_EXAMPLES[selectedId] ?? currentSpec.defaultProgram,
  );

  const [state, setState] = useState<MachineState>(() =>
    createInitialState(currentSpec.arch, selectedId),
  );

  const lines = assemblyCode.split("\n");

  const handleSelectInstruction = (newId: string) => {
    setSelectedId(newId);
    const spec =
      INSTRUCTIONS_DATA.find((i) => i.id === newId) ?? INSTRUCTIONS_DATA[0];
    const newCode = CODE_EXAMPLES[newId] ?? spec.defaultProgram;
    setAssemblyCode(newCode);
    setState(createInitialState(spec.arch, newId));
  };

  const handleReset = () => {
    setState(createInitialState(currentSpec.arch, selectedId));
  };

  const handleStep = () => {
    setState((prev) => stepEmulator(prev, lines));
  };

  const handleRunAll = () => {
    setState((prev) => {
      let current = prev;
      let limit = 100;
      while (!current.isHalted && limit > 0) {
        current = stepEmulator(current, lines);
        limit--;
      }
      return current;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="instruction-select"
            className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
          >
            Instruction:
          </label>
          <select
            id="instruction-select"
            value={selectedId}
            onChange={(e) => handleSelectInstruction(e.target.value)}
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
          <button
            type="button"
            onClick={handleStep}
            disabled={state.isHalted}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>&rarr;</span> Step Next
          </button>
          <button
            type="button"
            onClick={handleRunAll}
            disabled={state.isHalted}
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

      {/* Main Grid: Code Editor on Left, Live Machine State on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Code Editor & Execution Status */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                Assembly Editor ({currentSpec.assemblerType})
              </h4>
              <span className="text-[10px] font-mono text-zinc-500">
                PC: 0x{state.pc.toString(16)}
              </span>
            </div>

            <textarea
              rows={12}
              value={assemblyCode}
              onChange={(e) => setAssemblyCode(e.target.value)}
              className="w-full p-3 font-mono text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed resize-y"
            />

            {/* Instruction pointer tracking preview */}
            <div className="mt-3 p-2 rounded bg-zinc-100 dark:bg-zinc-800/60 font-mono text-xs space-y-1">
              <div className="text-[10px] text-zinc-500 uppercase">
                Active Program Counter Pointer:
              </div>
              <div className="text-emerald-600 dark:text-emerald-400 font-bold truncate">
                {lines[state.currentLineIndex]
                  ? `> ${lines[state.currentLineIndex]}`
                  : "(End of execution)"}
              </div>
            </div>
          </div>

          <TerminalOutput trace={state.trace} />
        </div>

        {/* Right Column: Registers, Privilege Levels, Micro-Ops */}
        <div className="lg:col-span-7 space-y-4">
          <RegisterView registers={state.registers} />
          <SpecialRegistersView
            specialRegisters={state.specialRegisters}
            privilege={state.privilege}
          />
          <MicroStepAudit
            steps={state.microStepsExecuted}
            instructionName={currentSpec.mnemonic}
          />
          <StackView stack={state.stack} />
        </div>
      </div>
    </div>
  );
}
