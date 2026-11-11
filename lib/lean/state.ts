import { BitVec } from "./fp";
import type { Arch, MicroOpStep, Privilege, TraceEvent } from "./domain";
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

export class MachineState {
  readonly arch: Arch;
  readonly pc: BitVec<64>;
  readonly privilege: Privilege;
  readonly registers: ReadonlyMap<string, BitVec<64>>;
  readonly specialRegisters: ReadonlyMap<string, string>;
  readonly flags: MachineFlags;
  readonly memory: PureMemory;
  readonly stack: readonly StackSlot[];
  readonly trace: readonly TraceEvent[];
  readonly microSteps: readonly MicroOpStep[];
  readonly isHalted: boolean;
  readonly exitCode: number | null;
  readonly stepCount: number;
  readonly activeLineIndex: number;

  constructor(init: {
    arch: Arch;
    pc: BitVec<64>;
    privilege: Privilege;
    registers: ReadonlyMap<string, BitVec<64>>;
    specialRegisters: ReadonlyMap<string, string>;
    flags: MachineFlags;
    memory: PureMemory;
    stack: readonly StackSlot[];
    trace: readonly TraceEvent[];
    microSteps: readonly MicroOpStep[];
    isHalted: boolean;
    exitCode: number | null;
    stepCount: number;
    activeLineIndex: number;
  }) {
    this.arch = init.arch;
    this.pc = init.pc;
    this.privilege = init.privilege;
    this.registers = init.registers;
    this.specialRegisters = init.specialRegisters;
    this.flags = init.flags;
    this.memory = init.memory;
    this.stack = init.stack;
    this.trace = init.trace;
    this.microSteps = init.microSteps;
    this.isHalted = init.isHalted;
    this.exitCode = init.exitCode;
    this.stepCount = init.stepCount;
    this.activeLineIndex = init.activeLineIndex;
  }

  // -------------------------------------------------------------------------
  // Register Lenses (with Aliasing & Zero Registers)
  // -------------------------------------------------------------------------

  getReg(name: string): BitVec<64> {
    const r = name.toLowerCase();

    // RISC-V zero register is hardwired to 0
    if (this.arch === "riscv" && (r === "zero" || r === "x0")) {
      return BitVec.zero(64);
    }
    // ARM zero registers
    if (this.arch === "arm64" && (r === "xzr" || r === "wzr")) {
      return BitVec.zero(64);
    }

    // x86 Sub-registers
    if (this.arch === "x86_64") {
      if (r === "eax")
        return BitVec.of(64, this.registers.get("rax")?.trunc32().val ?? 0n);
      if (r === "ebx")
        return BitVec.of(64, this.registers.get("rbx")?.trunc32().val ?? 0n);
      if (r === "ecx")
        return BitVec.of(64, this.registers.get("rcx")?.trunc32().val ?? 0n);
      if (r === "edx")
        return BitVec.of(64, this.registers.get("rdx")?.trunc32().val ?? 0n);
      if (r === "esi")
        return BitVec.of(64, this.registers.get("rsi")?.trunc32().val ?? 0n);
      if (r === "edi")
        return BitVec.of(64, this.registers.get("rdi")?.trunc32().val ?? 0n);
    }

    // ARM 32-bit views (w0..w30)
    if (this.arch === "arm64" && r.startsWith("w")) {
      const parent = `x${r.slice(1)}`;
      return BitVec.of(64, this.registers.get(parent)?.trunc32().val ?? 0n);
    }

    return this.registers.get(r) ?? BitVec.zero(64);
  }

  setReg(name: string, val: BitVec<64>): MachineState {
    const r = name.toLowerCase();

    // Writes to zero register are discarded
    if (this.arch === "riscv" && (r === "zero" || r === "x0")) return this;
    if (this.arch === "arm64" && (r === "xzr" || r === "wzr")) return this;

    const nextRegs = new Map(this.registers);

    if (this.arch === "x86_64") {
      if (r === "eax") {
        nextRegs.set("rax", val.trunc32().zext64());
        return this.withRegisters(nextRegs);
      }
      if (r === "ebx") {
        nextRegs.set("rbx", val.trunc32().zext64());
        return this.withRegisters(nextRegs);
      }
      if (r === "ecx") {
        nextRegs.set("rcx", val.trunc32().zext64());
        return this.withRegisters(nextRegs);
      }
      if (r === "edx") {
        nextRegs.set("rdx", val.trunc32().zext64());
        return this.withRegisters(nextRegs);
      }
      if (r === "esi") {
        nextRegs.set("rsi", val.trunc32().zext64());
        return this.withRegisters(nextRegs);
      }
      if (r === "edi") {
        nextRegs.set("rdi", val.trunc32().zext64());
        return this.withRegisters(nextRegs);
      }
    }

    if (this.arch === "arm64" && r.startsWith("w")) {
      const parent = `x${r.slice(1)}`;
      nextRegs.set(parent, val.trunc32().zext64());
      return this.withRegisters(nextRegs);
    }

    nextRegs.set(r, this.arch === "x86_32" ? val.trunc32().zext64() : val);
    return this.withRegisters(nextRegs);
  }

  // -------------------------------------------------------------------------
  // Immutable With-Copy Helpers
  // -------------------------------------------------------------------------

  withRegisters(registers: ReadonlyMap<string, BitVec<64>>): MachineState {
    return new MachineState({ ...this, registers });
  }

  withPc(pc: BitVec<64>): MachineState {
    return new MachineState({ ...this, pc });
  }

  withPrivilege(privilege: Privilege): MachineState {
    return new MachineState({ ...this, privilege });
  }

  withMemory(memory: PureMemory): MachineState {
    return new MachineState({ ...this, memory });
  }

  withSpecial(name: string, value: string): MachineState {
    const next = new Map(this.specialRegisters);
    next.set(name, value);
    return new MachineState({ ...this, specialRegisters: next });
  }

  withStack(stack: readonly StackSlot[]): MachineState {
    return new MachineState({ ...this, stack });
  }

  appendTrace(
    stream: "stdout" | "stderr" | "kernel_log",
    text: string,
  ): MachineState {
    return new MachineState({
      ...this,
      trace: [...this.trace, { stream, text, stepTick: this.stepCount + 1 }],
    });
  }

  withHalted(isHalted: boolean, exitCode: number | null = null): MachineState {
    return new MachineState({ ...this, isHalted, exitCode });
  }

  withMicroSteps(microSteps: readonly MicroOpStep[]): MachineState {
    return new MachineState({ ...this, microSteps });
  }

  withFlags(flags: MachineFlags): MachineState {
    return new MachineState({ ...this, flags });
  }

  withActiveLineIndex(activeLineIndex: number): MachineState {
    return new MachineState({ ...this, activeLineIndex });
  }

  incrementStep(): MachineState {
    return new MachineState({ ...this, stepCount: this.stepCount + 1 });
  }
}
