export type CpuArch = "x86_32" | "x86_64" | "arm64" | "riscv";

export type PrivilegeLevel =
  // x86 Rings
  | "Ring 3 (User)"
  | "Ring 0 (Kernel)"
  // ARM64 Exception Levels
  | "EL0 (User)"
  | "EL1 (Kernel)"
  | "EL2 (Hypervisor)"
  | "EL3 (Secure Monitor / Firmware)"
  // RISC-V Modes
  | "U-Mode (User)"
  | "S-Mode (Supervisor)"
  | "M-Mode (Machine)"
  // Confidential Computing (TDX)
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

export interface PStateFlags {
  n: boolean;
  z: boolean;
  c: boolean;
  v: boolean;
}

export interface TraceEvent {
  stream: "stdout" | "stderr" | "kernel_log";
  text: string;
  timestamp: number;
}

export interface MachineState {
  arch: CpuArch;
  activeInstructionId: string;
  pc: bigint;
  privilege: PrivilegeLevel;
  registers: Record<string, bigint>;
  flags: PStateFlags;
  // Architecture-specific control/status registers
  specialRegisters: Record<string, string | bigint>;
  stack: Array<{ address: bigint; value: bigint; label?: string }>;
  trace: TraceEvent[];
  isHalted: boolean;
  exitCode: number | null;
  history: string[];
  microStepsExecuted: MicroStep[];
  currentLineIndex: number;
}
