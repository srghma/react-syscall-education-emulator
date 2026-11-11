"use client";

import { useMemo, useState } from "react";
import { type Arch, privilegeToString } from "@/lib/lean/domain";
import { parseAssembly } from "@/lib/lean/assembler";
import { stepMachine } from "@/lib/lean/evaluator";
import { createInitialMachine } from "@/lib/lean/factory";
import type { MachineState } from "@/lib/lean/state";

export function useLeanEmulator(initialArch: Arch, initialCode: string) {
  const [arch, setArch] = useState<Arch>(initialArch);
  const [sourceCode, setSourceCode] = useState<string>(initialCode);
  const [history, setHistory] = useState<readonly MachineState[]>([]);

  const programResult = useMemo(
    () => parseAssembly(sourceCode, arch),
    [sourceCode, arch],
  );

  const [machine, setMachine] = useState<MachineState>(() => {
    let init = createInitialMachine(initialArch);
    const initialProg = parseAssembly(initialCode, initialArch);
    if (initialProg.tag === "ok") {
      init = init.withMemory(initialProg.value.initialMemory);
      const firstLine =
        initialProg.value.executableInstructions.length > 0
          ? initialProg.value.executableInstructions[0].lineIndex
          : 0;
      init = init.withActiveLineIndex(firstLine);
    }
    return init;
  });

  const handleReset = () => {
    let init = createInitialMachine(arch);
    if (programResult.tag === "ok") {
      init = init.withMemory(programResult.value.initialMemory);
      const firstLine =
        programResult.value.executableInstructions.length > 0
          ? programResult.value.executableInstructions[0].lineIndex
          : 0;
      init = init.withActiveLineIndex(firstLine);
    }
    setHistory([]);
    setMachine(init);
  };

  const handleStep = () => {
    if (programResult.tag === "error" || machine.isHalted) return;
    setHistory((prev) => [...prev, machine]);
    setMachine((prev) => stepMachine(prev, programResult.value));
  };

  const handleStepBack = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setMachine(previous);
  };

  const handleRunAll = (maxSteps = 100) => {
    if (programResult.tag === "error" || machine.isHalted) return;
    const stateSnapshots: MachineState[] = [machine];
    let curr = machine;
    let remaining = maxSteps;
    while (!curr.isHalted && remaining > 0) {
      curr = stepMachine(curr, programResult.value);
      stateSnapshots.push(curr);
      remaining--;
    }
    if (remaining === 0 && !curr.isHalted) {
      curr = curr.appendTrace(
        "stderr",
        `Execution cap of ${maxSteps} steps reached.`,
      );
    }
    setHistory((prev) => [...prev, ...stateSnapshots.slice(0, -1)]);
    setMachine(curr);
  };

  const handleArchChange = (nextArch: Arch, nextTemplate: string) => {
    setArch(nextArch);
    setSourceCode(nextTemplate);
    setHistory([]);
    let init = createInitialMachine(nextArch);
    const nextProg = parseAssembly(nextTemplate, nextArch);
    if (nextProg.tag === "ok") {
      init = init.withMemory(nextProg.value.initialMemory);
      const firstLine =
        nextProg.value.executableInstructions.length > 0
          ? nextProg.value.executableInstructions[0].lineIndex
          : 0;
      init = init.withActiveLineIndex(firstLine);
    }
    setMachine(init);
  };

  return {
    arch,
    sourceCode,
    setSourceCode,
    machine,
    programResult,
    canStepBack: history.length > 0,
    privilegeDisplay: privilegeToString(machine.privilege),
    handleStep,
    handleStepBack,
    handleRunAll,
    handleReset,
    handleArchChange,
  };
}
