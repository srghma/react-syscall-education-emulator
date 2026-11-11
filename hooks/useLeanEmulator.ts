"use client";

import { useMemo, useReducer } from "react";
import type { Arch, Privilege } from "@/lib/lean/domain";
import { parseAssembly, type Program } from "@/lib/lean/assembler";
import { stepMachine } from "@/lib/lean/evaluator";
import { createInitialMachine } from "@/lib/lean/factory";
import type { MachineState } from "@/lib/lean/state";

interface EmulatorReducerState {
  arch: Arch;
  sourceCode: string;
  machine: MachineState;
  history: MachineState[];
}

type Action =
  | { type: "EDIT_CODE"; code: string; initialPrivilege?: Privilege }
  | {
      type: "CHANGE_ARCH";
      arch: Arch;
      template: string;
      initialPrivilege?: Privilege;
    }
  | { type: "RESET"; initialPrivilege?: Privilege }
  | { type: "STEP"; program: Program }
  | { type: "STEP_BACK" }
  | { type: "RUN_ALL"; program: Program; maxSteps: number };

function createInitState(
  arch: Arch,
  code: string,
  initialPrivilege?: Privilege,
): MachineState {
  let machine = createInitialMachine(arch, initialPrivilege);
  const progRes = parseAssembly(code, arch);
  if (progRes.tag === "ok") {
    machine = {
      ...machine,
      pc: BitVec.of(64, progRes.value.entryPoint),
      memory: progRes.value.initialMemory,
      activeLineIndex:
        progRes.value.executableInstructions.length > 0
          ? progRes.value.executableInstructions[0].lineIndex
          : 0,
    };
  }
  return machine;
}

import { BitVec } from "@/lib/lean/fp";

function emulatorReducer(
  s: EmulatorReducerState,
  action: Action,
): EmulatorReducerState {
  switch (action.type) {
    case "EDIT_CODE": {
      const nextMachine = createInitState(
        s.arch,
        action.code,
        action.initialPrivilege,
      );
      return {
        ...s,
        sourceCode: action.code,
        machine: nextMachine,
        history: [],
      };
    }

    case "CHANGE_ARCH": {
      const nextMachine = createInitState(
        action.arch,
        action.template,
        action.initialPrivilege,
      );
      return {
        arch: action.arch,
        sourceCode: action.template,
        machine: nextMachine,
        history: [],
      };
    }

    case "RESET": {
      const nextMachine = createInitState(
        s.arch,
        s.sourceCode,
        action.initialPrivilege,
      );
      return { ...s, machine: nextMachine, history: [] };
    }

    case "STEP": {
      if (s.machine.isHalted) return s;
      const nextMachine = stepMachine(s.machine, action.program);
      return {
        ...s,
        machine: nextMachine,
        history: [...s.history, s.machine],
      };
    }

    case "STEP_BACK": {
      if (s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1];
      return {
        ...s,
        machine: prev,
        history: s.history.slice(0, -1),
      };
    }

    case "RUN_ALL": {
      if (s.machine.isHalted) return s;
      const snapshots: MachineState[] = [s.machine];
      let curr = s.machine;
      let steps = action.maxSteps;

      while (!curr.isHalted && steps > 0) {
        curr = stepMachine(curr, action.program);
        snapshots.push(curr);
        steps--;
      }

      if (steps === 0 && !curr.isHalted) {
        curr = {
          ...curr,
          trace: [
            ...curr.trace,
            {
              stream: "stderr",
              text: `Execution cap of ${action.maxSteps} steps reached.`,
              stepTick: curr.stepCount,
            },
          ],
        };
      }

      return {
        ...s,
        machine: curr,
        history: [...s.history, ...snapshots.slice(0, -1)],
      };
    }
  }
}

export function useLeanEmulator(
  initialArch: Arch,
  initialCode: string,
  initialPrivilege?: Privilege,
) {
  const [state, dispatch] = useReducer(emulatorReducer, null, () => ({
    arch: initialArch,
    sourceCode: initialCode,
    machine: createInitState(initialArch, initialCode, initialPrivilege),
    history: [],
  }));

  const programResult = useMemo(
    () => parseAssembly(state.sourceCode, state.arch),
    [state.sourceCode, state.arch],
  );

  return {
    arch: state.arch,
    sourceCode: state.sourceCode,
    machine: state.machine,
    programResult,
    canStepBack: state.history.length > 0,
    setSourceCode: (code: string) =>
      dispatch({ type: "EDIT_CODE", code, initialPrivilege }),
    handleStep: () => {
      if (programResult.tag === "ok") {
        dispatch({ type: "STEP", program: programResult.value });
      }
    },
    handleStepBack: () => dispatch({ type: "STEP_BACK" }),
    handleRunAll: (maxSteps = 100) => {
      if (programResult.tag === "ok") {
        dispatch({ type: "RUN_ALL", program: programResult.value, maxSteps });
      }
    },
    handleReset: () => dispatch({ type: "RESET", initialPrivilege }),
    handleArchChange: (arch: Arch, template: string, priv?: Privilege) =>
      dispatch({ type: "CHANGE_ARCH", arch, template, initialPrivilege: priv }),
  };
}
