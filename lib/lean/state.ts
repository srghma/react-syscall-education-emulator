import { BitVec } from "./fp";
import type {
  Arch,
  MicroOpStep,
  Privilege,
  SpecialRegEntry,
  TraceEvent,
} from "./domain";
import type { PureMemory } from "./memory";

export interface StackSlot {
  readonly address: BitVec<64>;
  readonly value: BitVec<64>;
  readonly tag: string;
}

export interface MachineFlags {
  readonly Z: boolean;
  readonly N: boolean;
  readonly C: boolean;
  readonly V: boolean;
}

export interface PendingReturn {
  readonly returnOp:
    | "sysretq"
    | "sysexit"
    | "iret"
    | "eret"
    | "sret"
    | "seamret";
  readonly returnPrivilege: Privilege;
  readonly returnPc: BitVec<64>;
  readonly popStackCount?: number;
}

export interface MachineState {
  readonly arch: Arch;
  readonly pc: BitVec<64>;
  readonly privilege: Privilege;
  readonly callerPrivilege?: Privilege;
  readonly registers: ReadonlyMap<string, BitVec<64>>;
  readonly specialRegisters: ReadonlyMap<string, SpecialRegEntry>;
  readonly flags: MachineFlags;
  readonly memory: PureMemory;
  readonly stack: readonly StackSlot[];
  readonly trace: readonly TraceEvent[];
  readonly microSteps: readonly MicroOpStep[];
  readonly isHalted: boolean;
  readonly exitCode: number | null;
  readonly haltReason?: string;
  readonly stepCount: number;
  readonly activeLineIndex: number;
  readonly kernelStackTop: bigint;
  readonly pendingReturn?: PendingReturn;
}

const X86_SUBREGISTERS: Record<
  string,
  { parent: string; width: 8 | 16 | 32; isHigh?: boolean }
> = {
  eax: { parent: "rax", width: 32 },
  ebx: { parent: "rbx", width: 32 },
  ecx: { parent: "rcx", width: 32 },
  edx: { parent: "rdx", width: 32 },
  esi: { parent: "rsi", width: 32 },
  edi: { parent: "rdi", width: 32 },
  ebp: { parent: "rbp", width: 32 },
  esp: { parent: "rsp", width: 32 },
  ax: { parent: "rax", width: 16 },
  bx: { parent: "rbx", width: 16 },
  cx: { parent: "rcx", width: 16 },
  dx: { parent: "rdx", width: 16 },
  al: { parent: "rax", width: 8 },
  bl: { parent: "rbx", width: 8 },
  cl: { parent: "rcx", width: 8 },
  dl: { parent: "rdx", width: 8 },
  ah: { parent: "rax", width: 8, isHigh: true },
  bh: { parent: "rbx", width: 8, isHigh: true },
  ch: { parent: "rcx", width: 8, isHigh: true },
  dh: { parent: "rdx", width: 8, isHigh: true },
};

export function readGpr(s: MachineState, regName: string): BitVec<64> {
  const r = regName.toLowerCase();

  if (s.arch === "riscv" && (r === "zero" || r === "x0")) {
    return BitVec.zero(64);
  }
  if (s.arch === "arm64" && (r === "xzr" || r === "wzr")) {
    return BitVec.zero(64);
  }

  if (s.arch === "x86_64" && r in X86_SUBREGISTERS) {
    const info = X86_SUBREGISTERS[r];
    const parentVal = s.registers.get(info.parent)?.val ?? 0n;
    if (info.isHigh) {
      return BitVec.of(64, (parentVal >> 8n) & 0xffn);
    }
    return BitVec.of(64, BigInt.asUintN(info.width, parentVal));
  }

  if (s.arch === "arm64" && r.startsWith("w")) {
    const parent = `x${r.slice(1)}`;
    const parentVal = s.registers.get(parent)?.val ?? 0n;
    return BitVec.of(64, BigInt.asUintN(32, parentVal));
  }

  return s.registers.get(r) ?? BitVec.zero(64);
}

export function writeGpr(
  s: MachineState,
  regName: string,
  val: BitVec<64>,
): MachineState {
  const r = regName.toLowerCase();

  if (s.arch === "riscv" && (r === "zero" || r === "x0")) return s;
  if (s.arch === "arm64" && (r === "xzr" || r === "wzr")) return s;

  const nextRegs = new Map(s.registers);

  if (s.arch === "x86_64" && r in X86_SUBREGISTERS) {
    const info = X86_SUBREGISTERS[r];
    if (info.width === 32) {
      nextRegs.set(info.parent, val.trunc32().zext64());
      return { ...s, registers: nextRegs };
    }
    const cur = s.registers.get(info.parent)?.val ?? 0n;
    let updated: bigint;
    if (info.isHigh) {
      updated = (cur & ~0xff00n) | ((val.val & 0xffn) << 8n);
    } else if (info.width === 16) {
      updated = (cur & ~0xffffn) | (val.val & 0xffffn);
    } else {
      updated = (cur & ~0xffn) | (val.val & 0xffn);
    }
    nextRegs.set(info.parent, BitVec.of(64, updated));
    return { ...s, registers: nextRegs };
  }

  if (s.arch === "arm64" && r.startsWith("w")) {
    const parent = `x${r.slice(1)}`;
    nextRegs.set(parent, val.trunc32().zext64());
    return { ...s, registers: nextRegs };
  }

  const bounded = s.arch === "x86_32" ? val.trunc32().zext64() : val;
  nextRegs.set(r, bounded);
  return { ...s, registers: nextRegs };
}

export function appendTrace(
  s: MachineState,
  stream: "stdout" | "stderr" | "kernel_log",
  text: string,
): MachineState {
  return {
    ...s,
    trace: [...s.trace, { stream, text, stepTick: s.stepCount + 1 }],
  };
}

export function setSpecialReg(
  s: MachineState,
  name: string,
  value: BitVec<64>,
  note?: string,
): MachineState {
  const next = new Map(s.specialRegisters);
  next.set(name, { value, note });
  return { ...s, specialRegisters: next };
}
