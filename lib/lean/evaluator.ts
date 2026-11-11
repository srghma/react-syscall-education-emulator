import { BitVec } from "./fp";
import type { Arch, MicroOpStep, Operand, Privilege } from "./domain";
import {
  type MachineState,
  type StackSlot,
  appendTrace,
  readGpr,
  setSpecialReg,
  writeGpr,
} from "./state";
import type { Program } from "./assembler";

function resolveOperand(op: Operand, state: MachineState): BitVec<64> {
  switch (op.tag) {
    case "imm":
      return op.value;
    case "reg":
      return readGpr(state, op.name);
    case "mem": {
      const base =
        op.mem.baseReg === "rip"
          ? state.pc.val
          : readGpr(state, op.mem.baseReg).val;
      return state.memory.readWord64(base + op.mem.offset);
    }
  }
}

function computeArmEsr(ec: number, il: boolean, iss: number): BitVec<64> {
  const raw =
    (BigInt(ec & 0x3f) << 26n) |
    (BigInt(il ? 1 : 0) << 25n) |
    BigInt(iss & 0x1ffffff);
  return BitVec.of(64, raw);
}

function evaluateAddFlags(
  v1: BitVec<64>,
  v2: BitVec<64>,
  res: BitVec<64>,
  arch: Arch,
) {
  const width = arch === "x86_32" ? 32 : 64;
  const maxVal = width === 32 ? 0xffffffffn : 0xffffffffffffffffn;
  const carry = v1.val + v2.val > maxVal;
  const s1 = (v1.val >> BigInt(width - 1)) & 1n;
  const s2 = (v2.val >> BigInt(width - 1)) & 1n;
  const sr = (res.val >> BigInt(width - 1)) & 1n;
  const overflow = s1 === s2 && s1 !== sr;
  return { Z: res.isZero(), N: sr === 1n, C: carry, V: overflow };
}

function evaluateSubFlags(
  v1: BitVec<64>,
  v2: BitVec<64>,
  res: BitVec<64>,
  arch: Arch,
) {
  const width = arch === "x86_32" ? 32 : 64;
  const s1 = (v1.val >> BigInt(width - 1)) & 1n;
  const s2 = (v2.val >> BigInt(width - 1)) & 1n;
  const sr = (res.val >> BigInt(width - 1)) & 1n;
  const overflow = s1 !== s2 && s1 !== sr;
  const carry = arch === "arm64" ? v1.val >= v2.val : v1.val < v2.val;
  return { Z: res.isZero(), N: sr === 1n, C: carry, V: overflow };
}

interface SyscallOutcome {
  state: MachineState;
  isExit?: boolean;
  exitCode?: number;
}

interface SyscallDef {
  name: string;
  execute: (s: MachineState, args: bigint[]) => SyscallOutcome;
}

const LINUX_SYSCALL_TABLE: Record<Arch, Record<number, SyscallDef>> = {
  x86_64: {
    1: {
      name: "sys_write",
      execute: (s, [fd, buf, count]) => {
        const text = s.memory.readAscii(buf, Number(count));
        const updated = writeGpr(s, "rax", BitVec.of(64, count));
        return {
          state: appendTrace(updated, "stdout", `[stdout fd=${fd}] ${text}`),
        };
      },
    },
    60: {
      name: "sys_exit",
      execute: (s, [code]) => ({
        state: s,
        isExit: true,
        exitCode: Number(code),
      }),
    },
  },
  x86_32: {
    4: {
      name: "sys_write",
      execute: (s, [fd, buf, count]) => {
        const text = s.memory.readAscii(buf, Number(count));
        const updated = writeGpr(s, "eax", BitVec.of(64, count));
        return {
          state: appendTrace(updated, "stdout", `[stdout fd=${fd}] ${text}`),
        };
      },
    },
    1: {
      name: "sys_exit",
      execute: (s, [code]) => ({
        state: s,
        isExit: true,
        exitCode: Number(code),
      }),
    },
  },
  arm64: {
    64: {
      name: "sys_write",
      execute: (s, [_fd, buf, count]) => {
        const text = s.memory.readAscii(buf, Number(count));
        const updated = writeGpr(s, "x0", BitVec.of(64, count));
        return {
          state: appendTrace(updated, "stdout", `[ARM64 stdout] ${text}`),
        };
      },
    },
    93: {
      name: "sys_exit",
      execute: (s, [code]) => ({
        state: s,
        isExit: true,
        exitCode: Number(code),
      }),
    },
  },
  riscv: {
    64: {
      name: "sys_write",
      execute: (s, [_fd, buf, count]) => {
        const text = s.memory.readAscii(buf, Number(count));
        const updated = writeGpr(s, "a0", BitVec.of(64, count));
        return {
          state: appendTrace(updated, "stdout", `[RISC-V stdout] ${text}`),
        };
      },
    },
    93: {
      name: "sys_exit",
      execute: (s, [code]) => ({
        state: s,
        isExit: true,
        exitCode: Number(code),
      }),
    },
  },
};

function dispatchTableSyscall(
  s: MachineState,
  nr: number,
  retReg: string,
  args: bigint[],
): SyscallOutcome {
  const handler = LINUX_SYSCALL_TABLE[s.arch]?.[nr];
  if (handler) {
    return handler.execute(s, args);
  }
  const updated = writeGpr(s, retReg, BitVec.of(64, -38n)); // -ENOSYS
  return {
    state: appendTrace(
      updated,
      "kernel_log",
      `[Kernel] Syscall ${nr} unknown. Returned -ENOSYS (-38).`,
    ),
  };
}

export function stepMachine(
  state: MachineState,
  program: Program,
): MachineState {
  if (state.isHalted) return state;

  // Execute Automatic Architectural Return
  if (state.pendingReturn) {
    const ret = state.pendingReturn;
    const nextExec = program.executableInstructions.find(
      (e) => e.address.val === ret.returnPc.val,
    );
    const nextActiveLine = nextExec ? nextExec.lineIndex : -1;

    let s: MachineState = {
      ...state,
      privilege: ret.returnPrivilege,
      pc: ret.returnPc,
      activeLineIndex: nextActiveLine,
      stepCount: state.stepCount + 1,
      microSteps: [],
      pendingReturn: undefined,
    };

    if (ret.popStackCount && ret.popStackCount > 0) {
      s = { ...s, stack: s.stack.slice(ret.popStackCount) };
    }

    return appendTrace(
      s,
      "kernel_log",
      `[Kernel Return] ${ret.returnOp} restored user context; resumed execution at ${ret.returnPc.toHex()}.`,
    );
  }

  const currentExec = program.executableInstructions.find(
    (e) => e.address.val === state.pc.val,
  );

  // CPU Fault: PC ran off end of .text
  if (!currentExec) {
    return {
      ...state,
      isHalted: true,
      haltReason:
        "Execution fault: Instruction pointer ran off the end of .text section",
      activeLineIndex: -1,
      microSteps: [],
    };
  }

  const instr = currentExec.instr;
  const nextPc = state.pc.add(BitVec.of(64, 4n));

  const nextExec = program.executableInstructions.find(
    (e) => e.address.val === nextPc.val,
  );
  const nextActiveLine = nextExec ? nextExec.lineIndex : -1;

  let s: MachineState = {
    ...state,
    pc: nextPc,
    activeLineIndex: nextActiveLine,
    stepCount: state.stepCount + 1,
    microSteps: [],
  };

  switch (instr.tag) {
    case "nop":
      return s;

    case "lea":
      return writeGpr(s, instr.dst, instr.address);

    case "mov": {
      const val = resolveOperand(instr.src, s);
      return writeGpr(s, instr.dst, val);
    }

    case "xor": {
      const val = resolveOperand(instr.src, s);
      const res = readGpr(s, instr.dst).xor(val);
      return writeGpr(s, instr.dst, res);
    }

    case "and": {
      const val = resolveOperand(instr.src, s);
      const res = readGpr(s, instr.dst).and(val);
      return writeGpr(s, instr.dst, res);
    }

    case "or": {
      const val = resolveOperand(instr.src, s);
      const res = readGpr(s, instr.dst).or(val);
      return writeGpr(s, instr.dst, res);
    }

    case "inc": {
      const cur = readGpr(s, instr.dst);
      const res = cur.add(BitVec.of(64, 1n));
      const flags = evaluateAddFlags(cur, BitVec.of(64, 1n), res, s.arch);
      return { ...writeGpr(s, instr.dst, res), flags };
    }

    case "dec": {
      const cur = readGpr(s, instr.dst);
      const res = cur.sub(BitVec.of(64, 1n));
      const flags = evaluateSubFlags(cur, BitVec.of(64, 1n), res, s.arch);
      return { ...writeGpr(s, instr.dst, res), flags };
    }

    case "jmp":
    case "b": {
      const target = instr.target;
      const targetAddr = program.symbols.get(target);
      if (targetAddr !== undefined) {
        const targetExec = program.executableInstructions.find(
          (e) => e.address.val === targetAddr,
        );
        return {
          ...s,
          pc: BitVec.of(64, targetAddr),
          activeLineIndex: targetExec ? targetExec.lineIndex : -1,
        };
      }
      return s;
    }

    case "jcc": {
      const shouldJump =
        (instr.condition === "z" && s.flags.Z) ||
        (instr.condition === "nz" && !s.flags.Z);
      if (shouldJump) {
        const targetAddr = program.symbols.get(instr.target);
        if (targetAddr !== undefined) {
          const targetExec = program.executableInstructions.find(
            (e) => e.address.val === targetAddr,
          );
          return {
            ...s,
            pc: BitVec.of(64, targetAddr),
            activeLineIndex: targetExec ? targetExec.lineIndex : -1,
          };
        }
      }
      return s;
    }

    case "b_cond": {
      const shouldJump =
        (instr.condition === "eq" && s.flags.Z) ||
        (instr.condition === "ne" && !s.flags.Z);
      if (shouldJump) {
        const targetAddr = program.symbols.get(instr.target);
        if (targetAddr !== undefined) {
          const targetExec = program.executableInstructions.find(
            (e) => e.address.val === targetAddr,
          );
          return {
            ...s,
            pc: BitVec.of(64, targetAddr),
            activeLineIndex: targetExec ? targetExec.lineIndex : -1,
          };
        }
      }
      return s;
    }

    case "push": {
      const val = resolveOperand(instr.src, s);
      const spReg =
        s.arch === "x86_32" ? "esp" : s.arch === "x86_64" ? "rsp" : "sp";
      const sp = readGpr(s, spReg);
      const widthBytes = s.arch === "x86_32" ? 4n : 8n;
      const nextSp = sp.sub(BitVec.of(64, widthBytes));
      let mem = s.memory;
      if (s.arch === "x86_32") {
        for (let i = 0; i < 4; i++) {
          mem = mem.writeByte(
            nextSp.val + BigInt(i),
            Number((val.val >> BigInt(i * 8)) & 0xffn),
          );
        }
      } else {
        mem = mem.writeWord64(nextSp.val, val);
      }
      const updated = writeGpr(s, spReg, nextSp);
      const newStackSlot: StackSlot = {
        address: nextSp,
        value: val,
        tag: "Pushed Value",
      };
      return { ...updated, memory: mem, stack: [newStackSlot, ...s.stack] };
    }

    case "pop": {
      const spReg =
        s.arch === "x86_32" ? "esp" : s.arch === "x86_64" ? "rsp" : "sp";
      const sp = readGpr(s, spReg);
      const widthBytes = s.arch === "x86_32" ? 4n : 8n;
      let val: BitVec<64>;
      if (s.arch === "x86_32") {
        let raw = 0n;
        for (let i = 0; i < 4; i++) {
          raw |= BigInt(s.memory.readByte(sp.val + BigInt(i))) << BigInt(i * 8);
        }
        val = BitVec.of(64, raw);
      } else {
        val = s.memory.readWord64(sp.val);
      }
      const nextSp = sp.add(BitVec.of(64, widthBytes));
      let updated = writeGpr(s, instr.dst, val);
      updated = writeGpr(updated, spReg, nextSp);
      return {
        ...updated,
        stack: s.stack.length > 0 ? s.stack.slice(1) : s.stack,
      };
    }

    case "add": {
      const v1 = resolveOperand(instr.src1, s);
      const v2 = resolveOperand(instr.src2, s);
      const res = v1.add(v2);
      const flags = evaluateAddFlags(v1, v2, res, s.arch);
      return { ...writeGpr(s, instr.dst, res), flags };
    }

    case "sub": {
      const v1 = resolveOperand(instr.src1, s);
      const v2 = resolveOperand(instr.src2, s);
      const res = v1.sub(v2);
      const flags = evaluateSubFlags(v1, v2, res, s.arch);
      return { ...writeGpr(s, instr.dst, res), flags };
    }

    case "cmp": {
      const v1 = readGpr(s, instr.op1);
      const v2 = resolveOperand(instr.op2, s);
      const res = v1.sub(v2);
      const flags = evaluateSubFlags(v1, v2, res, s.arch);
      return { ...s, flags };
    }

    case "hlt": {
      return {
        ...s,
        isHalted: true,
        exitCode: 0,
        haltReason: "HLT: Silicon core entered halted low-power state",
        activeLineIndex: -1,
      };
    }

    // -----------------------------------------------------------------------
    // Hardware Traps with Table-Driven Dispatch
    // -----------------------------------------------------------------------

    case "int": {
      if (instr.vector !== 0x80) {
        return appendTrace(
          s,
          "stderr",
          `[CPU Trap] Unhandled interrupt vector 0x${instr.vector.toString(16)}`,
        );
      }

      const userEsp = readGpr(s, "esp");
      const esp0 = s.kernelStackTop - 20n;
      const newSlots: StackSlot[] = [
        { address: BitVec.of(64, esp0), value: nextPc, tag: "Return EIP" },
        {
          address: BitVec.of(64, esp0 + 4n),
          value: BitVec.of(64, 0x73n),
          tag: "User CS",
        },
        {
          address: BitVec.of(64, esp0 + 8n),
          value: BitVec.of(64, 0x246n),
          tag: "EFLAGS",
        },
        { address: BitVec.of(64, esp0 + 12n), value: userEsp, tag: "User ESP" },
        {
          address: BitVec.of(64, esp0 + 16n),
          value: BitVec.of(64, 0x7bn),
          tag: "User SS",
        },
      ];

      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Gate Lookup",
          hardwareAction: "Gate read from IDTR.base + 0x80 * 8",
          modifiedBuses: ["IDTR"],
        },
        {
          phase: 2,
          name: "Stack Switch",
          hardwareAction: `ESP <= TSS.ESP0 (0x${esp0.toString(16)})`,
          modifiedBuses: ["ESP", "SS"],
        },
        {
          phase: 3,
          name: "Save Frame",
          hardwareAction: "Pushed [SS, ESP, EFLAGS, CS, EIP]",
          modifiedBuses: ["Stack"],
        },
        {
          phase: 4,
          name: "Privilege Shift",
          hardwareAction: "CPL switches 3 -> 0",
          modifiedBuses: ["CPL", "CS.DPL"],
        },
      ];

      s = {
        ...s,
        privilege: { tag: "x86", ring: 0 },
        stack: [...newSlots, ...s.stack],
        microSteps: micro,
        kernelStackTop: esp0,
      };
      s = setSpecialReg(
        s,
        "IDTR",
        BitVec.of(64, 0x80000000n),
        "IDT Base (Limit: 0x07FF)",
      );
      s = setSpecialReg(
        s,
        "Kernel Stack ESP0",
        BitVec.of(64, esp0),
        "TSS Ring 0 Stack Pointer",
      );

      const nr = Number(readGpr(s, "eax").val);
      const args = [
        readGpr(s, "ebx").val,
        readGpr(s, "ecx").val,
        readGpr(s, "edx").val,
      ];
      const outcome = dispatchTableSyscall(s, nr, "eax", args);
      s = outcome.state;

      if (outcome.isExit) {
        return {
          ...s,
          isHalted: true,
          exitCode: outcome.exitCode ?? 0,
          haltReason: `sys_exit(${outcome.exitCode})`,
          activeLineIndex: -1,
        };
      }

      return {
        ...s,
        pendingReturn: {
          returnOp: "iret",
          returnPrivilege: { tag: "x86", ring: 3 },
          returnPc: nextPc,
          popStackCount: 5,
        },
      };
    }

    case "sysenter": {
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Verify MSRs",
          hardwareAction: "Validated IA32_SYSENTER_CS (0x174)",
          modifiedBuses: ["MSR 0x174"],
        },
        {
          phase: 2,
          name: "Switch CS/SS",
          hardwareAction: "CS <= MSR 0x174, SS <= MSR 0x174 + 8, CPL <= 0",
          modifiedBuses: ["CS", "SS", "CPL"],
        },
        {
          phase: 3,
          name: "Load Stack & IP",
          hardwareAction: "ESP <= MSR 0x175 (0xc0002000), EIP <= MSR 0x176",
          modifiedBuses: ["ESP", "EIP"],
        },
      ];

      s = { ...s, privilege: { tag: "x86", ring: 0 }, microSteps: micro };
      s = setSpecialReg(
        s,
        "MSR 0x174 (SYSENTER_CS)",
        BitVec.of(64, 0x0060n),
        "Kernel CS",
      );
      s = setSpecialReg(
        s,
        "MSR 0x175 (SYSENTER_ESP)",
        BitVec.of(64, 0xc0002000n),
        "Kernel ESP0",
      );
      s = setSpecialReg(
        s,
        "MSR 0x176 (SYSENTER_EIP)",
        BitVec.of(64, 0xc0001000n),
        "sysenter_entry",
      );

      const nr = Number(readGpr(s, "eax").val);
      const args = [
        readGpr(s, "ebx").val,
        readGpr(s, "ecx").val,
        readGpr(s, "edx").val,
      ];
      const outcome = dispatchTableSyscall(s, nr, "eax", args);
      s = outcome.state;

      if (outcome.isExit) {
        return {
          ...s,
          isHalted: true,
          exitCode: outcome.exitCode ?? 0,
          haltReason: `sysenter sys_exit(${outcome.exitCode})`,
          activeLineIndex: -1,
        };
      }

      return {
        ...s,
        pendingReturn: {
          returnOp: "sysexit",
          returnPrivilege: { tag: "x86", ring: 3 },
          returnPc: nextPc,
        },
      };
    }

    case "syscall": {
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Save Context",
          hardwareAction: "RCX <= Return RIP, R11 <= RFLAGS",
          modifiedBuses: ["RCX", "R11"],
        },
        {
          phase: 2,
          name: "Mask RFLAGS",
          hardwareAction: "RFLAGS &= ~IA32_FMASK (0x47700)",
          modifiedBuses: ["RFLAGS"],
        },
        {
          phase: 3,
          name: "Switch Privilege",
          hardwareAction: "CPL switches to Ring 0",
          modifiedBuses: ["CPL"],
        },
        {
          phase: 4,
          name: "Direct Leap",
          hardwareAction: "RIP loads from IA32_LSTAR (0xffffffff81e00000)",
          modifiedBuses: ["RIP"],
        },
      ];

      s = { ...s, privilege: { tag: "x86", ring: 0 }, microSteps: micro };
      s = writeGpr(s, "rcx", nextPc);
      s = writeGpr(s, "r11", BitVec.of(64, 0x246n));
      s = setSpecialReg(
        s,
        "IA32_LSTAR",
        BitVec.of(64, 0xffffffff81e00000n),
        "entry_SYSCALL_64",
      );

      const nr = Number(readGpr(s, "rax").val);
      const args = [
        readGpr(s, "rdi").val,
        readGpr(s, "rsi").val,
        readGpr(s, "rdx").val,
        readGpr(s, "r10").val,
        readGpr(s, "r8").val,
        readGpr(s, "r9").val,
      ];
      const outcome = dispatchTableSyscall(s, nr, "rax", args);
      s = outcome.state;

      if (outcome.isExit) {
        return {
          ...s,
          isHalted: true,
          exitCode: outcome.exitCode ?? 0,
          haltReason: `64-bit sys_exit(${outcome.exitCode})`,
          activeLineIndex: -1,
        };
      }

      return {
        ...s,
        pendingReturn: {
          returnOp: "sysretq",
          returnPrivilege: { tag: "x86", ring: 3 },
          returnPc: nextPc,
        },
      };
    }

    case "svc": {
      const esr = computeArmEsr(0x15, true, instr.imm);
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Context Capture",
          hardwareAction: "ELR_EL1 <= next PC, SPSR_EL1 <= PSTATE",
          modifiedBuses: ["ELR_EL1", "SPSR_EL1"],
        },
        {
          phase: 2,
          name: "Syndrome Record",
          hardwareAction: `ESR_EL1 <= ${esr.toHex(false)} (EC=0x15 SVC, IL=1)`,
          modifiedBuses: ["ESR_EL1"],
        },
        {
          phase: 3,
          name: "Trap to EL1",
          hardwareAction: "PSTATE.EL switches 0 -> 1",
          modifiedBuses: ["PSTATE.EL"],
        },
      ];

      s = {
        ...s,
        privilege: { tag: "arm", el: 1, secure: false },
        microSteps: micro,
      };
      s = setSpecialReg(s, "ELR_EL1", nextPc, "Return PC");
      s = setSpecialReg(s, "ESR_EL1", esr, "EC=0x15 SVC, IL=1");
      s = setSpecialReg(
        s,
        "SPSR_EL1",
        BitVec.of(64, 0x00000000n),
        "EL0t, interrupts unmasked",
      );

      const nr = Number(readGpr(s, "x8").val);
      const args = [
        readGpr(s, "x0").val,
        readGpr(s, "x1").val,
        readGpr(s, "x2").val,
      ];
      const outcome = dispatchTableSyscall(s, nr, "x0", args);
      s = outcome.state;

      if (outcome.isExit) {
        return {
          ...s,
          isHalted: true,
          exitCode: outcome.exitCode ?? 0,
          haltReason: `AArch64 sys_exit(${outcome.exitCode})`,
          activeLineIndex: -1,
        };
      }

      return {
        ...s,
        pendingReturn: {
          returnOp: "eret",
          returnPrivilege: { tag: "arm", el: 0, secure: false },
          returnPc: nextPc,
        },
      };
    }

    case "hvc": {
      const esr = computeArmEsr(0x16, true, instr.imm);
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Context Capture",
          hardwareAction: "ELR_EL2 <= next PC, SPSR_EL2 <= PSTATE",
          modifiedBuses: ["ELR_EL2", "SPSR_EL2"],
        },
        {
          phase: 2,
          name: "Syndrome Record",
          hardwareAction: `ESR_EL2 <= ${esr.toHex(false)} (EC=0x16 HVC, IL=1)`,
          modifiedBuses: ["ESR_EL2"],
        },
        {
          phase: 3,
          name: "Trap to Hypervisor",
          hardwareAction: "PSTATE.EL switches 1 -> 2",
          modifiedBuses: ["PSTATE.EL"],
        },
      ];

      s = {
        ...s,
        privilege: { tag: "arm", el: 2, secure: false },
        microSteps: micro,
      };
      s = setSpecialReg(s, "ELR_EL2", nextPc, "Return PC");
      s = setSpecialReg(s, "ESR_EL2", esr, "EC=0x16 HVC");
      const fid = readGpr(s, "x0").toHex();
      s = writeGpr(s, "x0", BitVec.zero(64)); // PSCI_SUCCESS
      s = appendTrace(
        s,
        "kernel_log",
        `[Hypervisor EL2] Handled PSCI FID ${fid}. Core online.`,
      );

      return {
        ...s,
        pendingReturn: {
          returnOp: "eret",
          returnPrivilege: { tag: "arm", el: 1, secure: false },
          returnPc: nextPc,
        },
      };
    }

    case "smc": {
      const esr = computeArmEsr(0x17, true, instr.imm);
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Context Capture",
          hardwareAction: "ELR_EL3 <= next PC, SPSR_EL3 <= PSTATE",
          modifiedBuses: ["ELR_EL3", "SPSR_EL3"],
        },
        {
          phase: 2,
          name: "World Switch",
          hardwareAction: "Switched to Secure World at EL3 / ATF",
          modifiedBuses: ["SCR_EL3", "PSTATE.EL"],
        },
      ];

      s = {
        ...s,
        privilege: { tag: "arm", el: 3, secure: true },
        microSteps: micro,
      };
      s = setSpecialReg(s, "ELR_EL3", nextPc, "Return PC");
      s = setSpecialReg(s, "ESR_EL3", esr, "EC=0x17 SMC");
      s = writeGpr(s, "x0", BitVec.zero(64));
      s = appendTrace(
        s,
        "kernel_log",
        "[Secure Monitor EL3] SMCCC request handled by ARM Trusted Firmware.",
      );

      return {
        ...s,
        pendingReturn: {
          returnOp: "eret",
          returnPrivilege: { tag: "arm", el: 1, secure: false },
          returnPc: nextPc,
        },
      };
    }

    case "ecall": {
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Record PC",
          hardwareAction: "sepc <= address of ecall instruction itself",
          modifiedBuses: ["sepc"],
        },
        {
          phase: 2,
          name: "Mode Delegation",
          hardwareAction: "Trapped to S-Mode via medeleg bit 8 (scause = 8)",
          modifiedBuses: ["scause", "sstatus"],
        },
      ];

      s = { ...s, privilege: { tag: "riscv", mode: "S" }, microSteps: micro };
      s = setSpecialReg(s, "sepc", state.pc, "Address of ecall itself");
      s = setSpecialReg(
        s,
        "scause",
        BitVec.of(64, 8n),
        "Environment call from U-mode",
      );
      s = setSpecialReg(
        s,
        "sstatus",
        BitVec.of(64, 0x00000020n),
        "SPP=U, SPIE=1, SIE=0",
      );

      const nr = Number(readGpr(s, "a7").val);
      const args = [
        readGpr(s, "a0").val,
        readGpr(s, "a1").val,
        readGpr(s, "a2").val,
      ];
      const outcome = dispatchTableSyscall(s, nr, "a0", args);
      s = outcome.state;

      if (outcome.isExit) {
        return {
          ...s,
          isHalted: true,
          exitCode: outcome.exitCode ?? 0,
          haltReason: `RISC-V sys_exit(${outcome.exitCode})`,
          activeLineIndex: -1,
        };
      }

      return {
        ...s,
        pendingReturn: {
          returnOp: "sret",
          returnPrivilege: { tag: "riscv", mode: "U" },
          returnPc: nextPc,
        },
      };
    }

    case "tdcall": {
      const callerPriv: Privilege = s.privilege;
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "SEAMRR Check",
          hardwareAction: "Verified CPU SEAM mode configuration",
          modifiedBuses: ["SEAMRR"],
        },
        {
          phase: 2,
          name: "Trap to SEAM",
          hardwareAction:
            "Entered Intel SEAM Module from Confidential TD Guest",
          modifiedBuses: ["RIP"],
        },
        {
          phase: 3,
          name: "Scrub State",
          hardwareAction: "Zeroed non-shared guest registers",
          modifiedBuses: ["GPRs"],
        },
      ];

      s = {
        ...s,
        privilege: { tag: "tdx", domain: "SEAM" },
        callerPrivilege: callerPriv,
        microSteps: micro,
      };
      s = setSpecialReg(s, "Intel SEAM Status", BitVec.zero(64), "TDX_SUCCESS");
      s = writeGpr(s, "rax", BitVec.zero(64));
      s = appendTrace(
        s,
        "kernel_log",
        "[Intel SEAM Module] tdcall TDG.VP.VMCALL executed. Non-shared registers scrubbed.",
      );

      return {
        ...s,
        pendingReturn: {
          returnOp: "seamret",
          returnPrivilege: callerPriv,
          returnPc: nextPc,
        },
      };
    }

    case "seamcall": {
      const callerPriv: Privilege = s.privilege;
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Validate VMX Root",
          hardwareAction: "CR4.VMXE == 1 verified in root operation",
          modifiedBuses: ["CR4"],
        },
        {
          phase: 2,
          name: "Enter SEAM",
          hardwareAction: "Switched to Secure Arbitration Mode",
          modifiedBuses: ["SEAM Mode"],
        },
      ];

      s = {
        ...s,
        privilege: { tag: "tdx", domain: "SEAM" },
        callerPrivilege: callerPriv,
        microSteps: micro,
      };
      s = setSpecialReg(
        s,
        "Intel SEAM Mode",
        BitVec.of(64, 1n),
        "Active Root Operation verified",
      );
      s = writeGpr(s, "rax", BitVec.zero(64));
      s = appendTrace(
        s,
        "kernel_log",
        "[Host Hypervisor] seamcall invoked TDH.MNG.INIT. Secure EPT programmed.",
      );

      return {
        ...s,
        pendingReturn: {
          returnOp: "seamret",
          returnPrivilege: callerPriv,
          returnPc: nextPc,
        },
      };
    }

    case "sysret":
      return {
        ...s,
        privilege: { tag: "x86", ring: 3 },
        pc: readGpr(s, "rcx"),
      };

    case "sysexit":
      return {
        ...s,
        privilege: { tag: "x86", ring: 3 },
        pc: readGpr(s, "edx"),
        registers: writeGpr(s, "esp", readGpr(s, "ecx")).registers,
      };

    case "iret": {
      if (s.stack.length >= 5) {
        const retEip = s.stack[0].value;
        const retEsp = s.stack[3].value;
        s = writeGpr(s, "esp", retEsp);
        return {
          ...s,
          privilege: { tag: "x86", ring: 3 },
          pc: retEip,
          stack: s.stack.slice(5),
        };
      }
      return { ...s, privilege: { tag: "x86", ring: 3 } };
    }

    case "eret": {
      const spsr = s.specialRegisters.get("SPSR_EL1");
      const targetEl = spsr && (spsr.value.val & 0xfn) === 0n ? 0 : 1;
      const elr = s.specialRegisters.get("ELR_EL1")?.value ?? nextPc;
      return {
        ...s,
        privilege: { tag: "arm", el: targetEl as 0 | 1, secure: false },
        pc: elr,
      };
    }

    case "sret": {
      const sepc = (s.specialRegisters.get("sepc")?.value ?? state.pc).add(
        BitVec.of(64, 4n),
      );
      return { ...s, privilege: { tag: "riscv", mode: "U" }, pc: sepc };
    }

    case "mret": {
      const mepc = (s.specialRegisters.get("mepc")?.value ?? state.pc).add(
        BitVec.of(64, 4n),
      );
      return { ...s, privilege: { tag: "riscv", mode: "S" }, pc: mepc };
    }

    case "seamret": {
      const target = s.callerPrivilege ?? { tag: "tdx", domain: "TDGuest" };
      return { ...s, privilege: target };
    }

    default:
      return s;
  }
}
