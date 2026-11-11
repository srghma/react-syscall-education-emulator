import type { BitVec } from "./fp";

export type Arch = "x86_32" | "x86_64" | "arm64" | "riscv";

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

export type MemoryOperand = {
  readonly baseReg: string;
  readonly offset: bigint;
  readonly isRipRelative?: boolean;
};

export type Operand =
  | { readonly tag: "reg"; readonly name: string }
  | { readonly tag: "imm"; readonly value: BitVec<64> }
  | { readonly tag: "mem"; readonly mem: MemoryOperand };

export type Instruction =
  | { readonly tag: "mov"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "lea"; readonly dst: string; readonly address: BitVec<64> }
  | { readonly tag: "xor"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "and"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "or"; readonly dst: string; readonly src: Operand }
  | { readonly tag: "inc"; readonly dst: string }
  | { readonly tag: "dec"; readonly dst: string }
  | {
      readonly tag: "add";
      readonly dst: string;
      readonly src1: Operand;
      readonly src2: Operand;
    }
  | {
      readonly tag: "sub";
      readonly dst: string;
      readonly src1: Operand;
      readonly src2: Operand;
    }
  | { readonly tag: "cmp"; readonly op1: string; readonly op2: Operand }
  | { readonly tag: "jmp"; readonly target: string }
  | {
      readonly tag: "jcc";
      readonly condition: "e" | "ne" | "z" | "nz";
      readonly target: string;
    }
  | { readonly tag: "b"; readonly target: string }
  | {
      readonly tag: "b_cond";
      readonly condition: "eq" | "ne";
      readonly target: string;
    }
  | { readonly tag: "push"; readonly src: Operand }
  | { readonly tag: "pop"; readonly dst: string }
  // Traps
  | { readonly tag: "int"; readonly vector: number }
  | { readonly tag: "sysenter" }
  | { readonly tag: "syscall" }
  | { readonly tag: "svc"; readonly imm: number }
  | { readonly tag: "hvc"; readonly imm: number }
  | { readonly tag: "smc"; readonly imm: number }
  | { readonly tag: "ecall" }
  | { readonly tag: "tdcall" }
  | { readonly tag: "seamcall" }
  // Returns
  | { readonly tag: "iret" }
  | { readonly tag: "sysexit" }
  | { readonly tag: "sysret" }
  | { readonly tag: "eret" }
  | { readonly tag: "sret" }
  | { readonly tag: "mret" }
  | { readonly tag: "seamret" }
  | { readonly tag: "hlt" }
  | { readonly tag: "nop" };

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

export interface SpecialRegEntry {
  readonly value: BitVec<64>;
  readonly note?: string;
}

export interface ParseDiagnostic {
  readonly line: number;
  readonly col: number;
  readonly message: string;
}
