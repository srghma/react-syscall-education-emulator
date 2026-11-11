import type { BitVec } from "./fp";

export type Arch = "x86_32" | "x86_64" | "arm64" | "riscv";

/**
 * Inductive Privilege: Privilege is a typed sum varying by architecture.
 */
export type Privilege =
  | { readonly tag: "x86"; readonly ring: 0 | 3 }
  | {
      readonly tag: "arm";
      readonly el: 0 | 1 | 2 | 3;
      readonly secure: boolean;
    }
  | { readonly tag: "riscv"; readonly mode: "U" | "S" | "M" }
  | { readonly tag: "tdx"; readonly domain: "TDGuest" | "SEAM" | "HostVMM" };

export function privilegeToString(p: Privilege): string {
  switch (p.tag) {
    case "x86":
      return `Ring ${p.ring} (${p.ring === 0 ? "Kernel" : "User"})`;
    case "arm":
      return `EL${p.el} (${p.secure ? "Secure World" : "Normal World"})`;
    case "riscv":
      return `${p.mode}-Mode`;
    case "tdx":
      return `Intel TDX: ${p.domain}`;
  }
}

/**
 * Inductive Operand AST.
 */
export type Operand =
  | { readonly tag: "reg"; readonly name: string }
  | { readonly tag: "imm"; readonly value: BitVec<64> }
  | { readonly tag: "mem"; readonly baseReg: string; readonly offset: bigint };

/**
 * Inductive Instruction AST: Parsed directly from assembly source.
 */
export type Instruction =
  | { readonly tag: "mov"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "xor"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "add"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "sub"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "cmp"; readonly op1: string; readonly op2: Operand }
  // Trap instructions
  | { readonly tag: "int"; readonly vector: number }
  | { readonly tag: "sysenter" }
  | { readonly tag: "syscall" }
  | { readonly tag: "svc"; readonly imm: number }
  | { readonly tag: "hvc"; readonly imm: number }
  | { readonly tag: "smc"; readonly imm: number }
  | { readonly tag: "ecall" }
  | { readonly tag: "tdcall" }
  | { readonly tag: "seamcall" }
  // Return instructions
  | { readonly tag: "iret" }
  | { readonly tag: "sysexit" }
  | { readonly tag: "sysret" }
  | { readonly tag: "eret" }
  | { readonly tag: "sret" }
  | { readonly tag: "seamret" }
  | { readonly tag: "hlt" };

export interface MicroOpStep {
  readonly phase: number;
  readonly name: string;
  readonly hardwareAction: string;
  readonly modifiedBuses: readonly string[];
}

export interface TraceEvent {
  readonly stream: "stdout" | "stderr" | "kernel_log";
  readonly text: string;
  readonly stepTick: number;
}
