import { BitVec } from "./fp";
import type { Arch, Privilege, SpecialRegEntry } from "./domain";
import type { MachineState, StackSlot } from "./state";
import { PureMemory } from "./memory";

export function createInitialMachine(
  arch: Arch,
  initialPrivilege?: Privilege,
): MachineState {
  const regs = new Map<string, BitVec<64>>();
  const specials = new Map<string, SpecialRegEntry>();
  const mem = new PureMemory();
  let privilege: Privilege;
  let spVal: BitVec<64>;

  switch (arch) {
    case "x86_32": {
      privilege = initialPrivilege ?? { tag: "x86", ring: 3 };
      spVal = BitVec.of(64, 0xbf800000n);
      for (const r of [
        "eax",
        "ebx",
        "ecx",
        "edx",
        "esi",
        "edi",
        "ebp",
        "esp",
      ]) {
        regs.set(r, BitVec.zero(64));
      }
      regs.set("esp", spVal);
      specials.set("IDTR", {
        value: BitVec.of(64, 0x80000000n),
        note: "Limit: 0x07FF",
      });
      specials.set("MSR 0x174 (SYSENTER_CS)", {
        value: BitVec.of(64, 0x0060n),
        note: "Kernel CS",
      });
      specials.set("MSR 0x175 (SYSENTER_ESP)", {
        value: BitVec.of(64, 0xc0002000n),
        note: "Kernel ESP0",
      });
      specials.set("MSR 0x176 (SYSENTER_EIP)", {
        value: BitVec.of(64, 0xc0001000n),
        note: "sysenter_entry",
      });
      break;
    }

    case "x86_64": {
      privilege = initialPrivilege ?? { tag: "x86", ring: 3 };
      spVal = BitVec.of(64, 0x7fffffffe000n);
      for (const r of [
        "rax",
        "rbx",
        "rcx",
        "rdx",
        "rsi",
        "rdi",
        "rbp",
        "rsp",
        "r8",
        "r9",
        "r10",
        "r11",
        "r12",
        "r13",
        "r14",
        "r15",
      ]) {
        regs.set(r, BitVec.zero(64));
      }
      regs.set("rsp", spVal);
      specials.set("IA32_LSTAR", {
        value: BitVec.of(64, 0xffffffff81e00000n),
        note: "entry_SYSCALL_64",
      });
      specials.set("IA32_STAR", {
        value: BitVec.of(64, 0x0023001000000000n),
        note: "Selectors",
      });
      specials.set("IA32_FMASK", {
        value: BitVec.of(64, 0x0000000000047700n),
        note: "TF, IF, DF, IOPL, NT, AC",
      });
      break;
    }

    case "arm64": {
      privilege = initialPrivilege ?? { tag: "arm", el: 0, secure: false };
      spVal = BitVec.of(64, 0x0000ffffffffb000n);
      for (let i = 0; i <= 30; i++) {
        regs.set(`x${i}`, BitVec.zero(64));
      }
      regs.set("sp", spVal);
      specials.set("ELR_EL1", { value: BitVec.zero(64), note: "Return PC" });
      specials.set("SPSR_EL1", {
        value: BitVec.zero(64),
        note: "EL0t, interrupts unmasked",
      });
      specials.set("ESR_EL1", { value: BitVec.zero(64), note: "Syndrome" });
      specials.set("VBAR_EL1", {
        value: BitVec.of(64, 0xffff800008080000n),
        note: "Vector Base",
      });
      break;
    }

    case "riscv": {
      privilege = initialPrivilege ?? { tag: "riscv", mode: "U" };
      spVal = BitVec.of(64, 0x7ffffff0n);
      for (const r of [
        "zero",
        "ra",
        "sp",
        "gp",
        "tp",
        "t0",
        "t1",
        "t2",
        "s0",
        "s1",
        "a0",
        "a1",
        "a2",
        "a3",
        "a4",
        "a5",
        "a6",
        "a7",
        "s2",
        "s3",
        "s4",
        "s5",
        "s6",
        "s7",
        "s8",
        "s9",
        "s10",
        "s11",
        "t3",
        "t4",
        "t5",
        "t6",
      ]) {
        regs.set(r, BitVec.zero(64));
      }
      regs.set("sp", spVal);
      specials.set("sepc", { value: BitVec.zero(64), note: "Trap PC" });
      specials.set("scause", { value: BitVec.zero(64), note: "None" });
      specials.set("stvec", {
        value: BitVec.of(64, 0x80000000n),
        note: "Supervisor Trap Base",
      });
      specials.set("medeleg", {
        value: BitVec.of(64, 0x00000100n),
        note: "Delegated U-Mode ecall",
      });
      break;
    }
  }

  const initialStack: StackSlot[] = [
    { address: spVal, value: BitVec.zero(64), tag: "Initial Stack Top" },
  ];

  return {
    arch,
    pc: BitVec.of(64, 0x00400000n),
    privilege,
    registers: regs,
    specialRegisters: specials,
    flags: { Z: false, N: false, C: false, V: false },
    memory: mem,
    stack: initialStack,
    trace: [],
    microSteps: [],
    isHalted: false,
    exitCode: null,
    stepCount: 0,
    activeLineIndex: 0,
    kernelStackTop: 0xc0002000n,
  };
}
