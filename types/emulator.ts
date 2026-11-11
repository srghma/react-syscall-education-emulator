import type { Privilege } from "@/lib/lean/domain";
import type { MachineState } from "@/lib/lean/state";

export type CpuArch = "x86_32" | "x86_64" | "arm64" | "riscv";

export type { Privilege as PrivilegeLevel };
export type { MachineState };

export interface MicroStep {
  stepNumber: number;
  description: string;
  hardwareAction: string;
  affectedComponents: string[];
}

export interface InstructionSpec {
  id: string;
  mnemonic: string;
  fullName: string;
  arch: CpuArch;
  archDisplay: string;
  yearIntroduced: number;
  yearSiliconShipped: number;
  era: string;
  assemblerType: string;
  sourcePrivilege: Privilege;
  targetPrivilege: Privilege;
  hardwareMechanism: string;
  returnInstruction: string;
  keyRegisters: string[];
  summary: string;
  hardwareSteps: MicroStep[];
  defaultProgram: string;
  docsReference: string;
  sourceUrl?: string;
  verified: boolean;
}

export interface TraceEvent {
  stream: "stdout" | "stderr" | "kernel_log";
  text: string;
  timestamp?: number;
  stepTick?: number;
  step?: number;
}
