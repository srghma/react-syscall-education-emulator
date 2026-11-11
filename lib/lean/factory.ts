import { BitVec } from "./fp";
import type { Arch, Privilege } from "./domain";
import { MachineState, type StackSlot } from "./state";
import { PureMemory } from "./memory";

export function createInitialMachine(arch: Arch): MachineState {
  const regs = new Map<string, BitVec<64>>();
  const specials = new Map<string, string>();
  let mem = new PureMemory();
  let privilege: Privilege;
  let spVal: BitVec<64>;

  mem = mem.writeAscii(0x00402000n, "Hello from SyscallEDU!\n");

  switch (arch) {
    case "x86_32": {
      privilege = { tag: "x86", ring: 3 };
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
      specials.set("IDTR", "0x80000000 (Limit: 0x07FF)");
      specials.set("MSR 0x174 (SYSENTER_CS)", "0x0060 (Kernel CS)");
      specials.set("MSR 0x175 (SYSENTER_ESP)", "0xc0002000 (Kernel ESP0)");
      specials.set("MSR 0x176 (SYSENTER_EIP)", "0xc0001000 (sysenter_entry)");
      break;
    }

    case "x86_64": {
      privilege = { tag: "x86", ring: 3 };
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
      specials.set("IA32_LSTAR", "0xffffffff81e00000 (entry_SYSCALL_64)");
      specials.set("IA32_STAR", "0x0023001000000000");
      specials.set("IA32_FMASK", "0x0000000000047700 (Mask TF, IF, DF, AC)");
      break;
    }

    case "arm64": {
      privilege = { tag: "arm", el: 0, secure: false };
      spVal = BitVec.of(64, 0x0000ffffffffb000n);
      for (let i = 0; i <= 30; i++) {
        regs.set(`x${i}`, BitVec.zero(64));
      }
      regs.set("sp", spVal);
      specials.set("ELR_EL1", "0x0000000000000000");
      specials.set("SPSR_EL1", "0x00000000 (EL0t, interrupts unmasked)");
      specials.set("ESR_EL1", "0x00000000");
      specials.set("VBAR_EL1", "0xffff800008080000");
      break;
    }

    case "riscv": {
      privilege = { tag: "riscv", mode: "U" };
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
      specials.set("sepc", "0x0000000000000000");
      specials.set("scause", "0 (None)");
      specials.set("stvec", "0x80000000 (Supervisor Trap Base)");
      specials.set("medeleg", "0x00000100 (Delegate U-Mode ecall to S-Mode)");
      break;
    }
  }

  const initialStack: StackSlot[] = [
    { address: spVal, value: BitVec.zero(64), tag: "Initial Stack Top" },
  ];

  return new MachineState({
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
  });
}
