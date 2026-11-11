export type CpuArch = "x86_32" | "x86_64" | "arm64" | "riscv";

export type PrivilegeLevel =
  | "Ring 3 (User)"
  | "Ring 0 (Kernel)"
  | "EL0 (User)"
  | "EL1 (Kernel)"
  | "EL2 (Hypervisor)"
  | "EL3 (Secure Monitor / Firmware)"
  | "U-Mode (User)"
  | "S-Mode (Supervisor)"
  | "M-Mode (Machine)"
  | "TD Guest (VMX Non-Root Encrypted)"
  | "Intel SEAM (Secure Arbitration Mode)"
  | "Host VMM (Root Ring 0)";

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
  sourcePrivilege: PrivilegeLevel;
  targetPrivilege: PrivilegeLevel;
  hardwareMechanism: string;
  returnInstruction: string;
  keyRegisters: string[];
  summary: string;
  hardwareSteps: MicroStep[];
  defaultProgram: string;
  docsReference: string;
}

export interface MachineFlags {
  n: boolean;
  z: boolean;
  c: boolean;
  v: boolean;
  if?: boolean;
}

export interface TraceEvent {
  stream: "stdout" | "stderr" | "kernel_log";
  text: string;
  timestamp?: number;
  step?: number;
}

export interface StackSlotItem {
  address: bigint;
  value: bigint;
  label?: string;
}

export interface MachineState {
  arch: CpuArch;
  activeInstructionId: string;
  pc: bigint;
  privilege: PrivilegeLevel;
  registers: Record<string, bigint>;
  flags: MachineFlags;
  specialRegisters: Record<string, string | bigint>;
  stack: StackSlotItem[];
  trace: TraceEvent[];
  isHalted: boolean;
  exitCode: number | null;
  history: string[];
  microStepsExecuted: MicroStep[];
  currentLineIndex: number;
  stepCount: number;
}
