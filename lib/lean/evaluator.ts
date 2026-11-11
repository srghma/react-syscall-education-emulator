import { BitVec } from "./fp";
import type { MicroOpStep, Operand } from "./domain";
import type { MachineState, StackSlot } from "./state";
import type { Program } from "./assembler";

function resolveOperand(op: Operand, state: MachineState): BitVec<64> {
  switch (op.tag) {
    case "imm":
      return op.value;
    case "reg":
      return state.getReg(op.name);
    case "mem":
      return state.memory.readWord64(state.getReg(op.baseReg).val + op.offset);
  }
}

function computeArmEsr(ec: number, il: boolean, iss: number): string {
  const raw =
    (BigInt(ec & 0x3f) << 26n) |
    (BigInt(il ? 1 : 0) << 25n) |
    BigInt(iss & 0x1ffffff);
  return `0x${raw.toString(16).padStart(8, "0")}`;
}

export function stepMachine(
  state: MachineState,
  program: Program,
): MachineState {
  if (state.isHalted) return state;

  const currentExec = program.executableInstructions.find(
    (e) => e.address.val === state.pc.val,
  );

  if (!currentExec) {
    return state.withHalted(true).withActiveLineIndex(-1);
  }

  const instr = currentExec.instr;
  const nextPc = state.pc.add(BitVec.of(64, 4n));

  const nextExec = program.executableInstructions.find(
    (e) => e.address.val === nextPc.val,
  );
  const nextActiveLine = nextExec ? nextExec.lineIndex : -1;

  let s = state
    .withPc(nextPc)
    .withActiveLineIndex(nextActiveLine)
    .incrementStep();

  switch (instr.tag) {
    case "mov": {
      const val = resolveOperand(instr.src, s);
      return s.setReg(instr.dst, val);
    }

    case "xor": {
      const val = resolveOperand(instr.src, s);
      const res = s.getReg(instr.dst).xor(val);
      const nextFlags = { ...s.flags, Z: res.isZero(), N: false };
      return s.setReg(instr.dst, res).withFlags(nextFlags);
    }

    case "add": {
      const val = resolveOperand(instr.src, s);
      const res = s.getReg(instr.dst).add(val);
      return s
        .setReg(instr.dst, res)
        .withFlags({ ...s.flags, Z: res.isZero(), N: false });
    }

    case "sub": {
      const val = resolveOperand(instr.src, s);
      const res = s.getReg(instr.dst).sub(val);
      return s
        .setReg(instr.dst, res)
        .withFlags({ ...s.flags, Z: res.isZero(), N: false });
    }

    case "cmp": {
      const v1 = s.getReg(instr.op1);
      const v2 = resolveOperand(instr.op2, s);
      const diff = v1.sub(v2);
      return s.withFlags({
        Z: diff.isZero(),
        N: diff.val > 0x7fffffffffffffffn,
        C: v1.val >= v2.val,
        V: false,
      });
    }

    case "hlt": {
      return s
        .withHalted(true)
        .withActiveLineIndex(-1)
        .appendTrace("kernel_log", "CPU silicon entered halted state.");
    }

    // -----------------------------------------------------------------------
    // Transition Traps
    // -----------------------------------------------------------------------

    case "int": {
      const userEsp = s.getReg("esp");
      const newSlots: StackSlot[] = [
        {
          address: BitVec.of(64, 0xc0001ffcn),
          value: BitVec.of(64, 0x7bn),
          tag: "User SS",
        },
        {
          address: BitVec.of(64, 0xc0001ff8n),
          value: userEsp,
          tag: "User ESP",
        },
        {
          address: BitVec.of(64, 0xc0001ff4n),
          value: BitVec.of(64, 0x246n),
          tag: "EFLAGS",
        },
        {
          address: BitVec.of(64, 0xc0001ff0n),
          value: BitVec.of(64, 0x73n),
          tag: "User CS",
        },
        {
          address: BitVec.of(64, 0xc0001fecn),
          value: nextPc,
          tag: "Return EIP",
        },
      ];

      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "IDT Lookup",
          hardwareAction: "Gate read from IDTR base + 0x80 * 8",
          modifiedBuses: ["IDTR"],
        },
        {
          phase: 2,
          name: "Stack Switch",
          hardwareAction: "ESP set to TSS.ESP0 (0xc0001fec)",
          modifiedBuses: ["ESP", "SS"],
        },
        {
          phase: 3,
          name: "Save Frame",
          hardwareAction: "Push SS, ESP, EFLAGS, CS, Return EIP",
          modifiedBuses: ["Stack"],
        },
        {
          phase: 4,
          name: "Privilege Shift",
          hardwareAction: "CPL switches 3 -> 0",
          modifiedBuses: ["CPL", "CS.DPL"],
        },
      ];

      s = s
        .withPrivilege({ tag: "x86", ring: 0 })
        .withStack([...newSlots, ...s.stack])
        .withMicroSteps(micro)
        .withSpecial("Last Trapped Vector", "0x80 (IDT Syscall Gate)")
        .withSpecial("Kernel Stack ESP0", "0xc0001fec");

      const sysNr = Number(s.getReg("eax").val);
      if (sysNr === 1) {
        const code = Number(s.getReg("ebx").val);
        return s
          .withHalted(true, code)
          .withActiveLineIndex(-1)
          .appendTrace("kernel_log", `sys_exit(${code}) called. Terminated.`);
      }
      if (sysNr === 4) {
        const fd = s.getReg("ebx").val;
        const ptr = s.getReg("ecx").val;
        const count = Number(s.getReg("edx").val);
        const text =
          ptr > 0n
            ? s.memory.readAscii(ptr, count)
            : `Simulated write (${count} bytes)`;
        return s
          .setReg("eax", BitVec.of(64, count))
          .appendTrace("stdout", `[stdout fd=${fd}] ${text}`);
      }
      return s;
    }

    case "sysenter": {
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Verify MSR Setup",
          hardwareAction: "Validate IA32_SYSENTER_CS (0x174) is non-zero",
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
          hardwareAction:
            "ESP <= MSR 0x175 (0xc0002000), EIP <= MSR 0x176, clear IF",
          modifiedBuses: ["ESP", "EIP", "EFLAGS"],
        },
      ];

      s = s
        .withPrivilege({ tag: "x86", ring: 0 })
        .withMicroSteps(micro)
        .withSpecial("Active Entry Path", "MSR 0x176 (sysenter_entry)")
        .withSpecial("Kernel Stack ESP0", "0xc0002000");

      const sysNr = Number(s.getReg("eax").val);
      if (sysNr === 1) {
        const code = Number(s.getReg("ebx").val);
        return s
          .withHalted(true, code)
          .withActiveLineIndex(-1)
          .appendTrace(
            "kernel_log",
            `[Kernel Ring 0] sysenter sys_exit(${code}). Process terminated.`,
          );
      }
      if (sysNr === 4) {
        const fd = s.getReg("ebx").val;
        const ptr = s.getReg("ecx").val;
        const count = Number(s.getReg("edx").val);
        const text =
          ptr > 0n
            ? s.memory.readAscii(ptr, count)
            : `Simulated write (${count} bytes)`;
        return s
          .setReg("eax", BitVec.of(64, count))
          .appendTrace("stdout", `[stdout fd=${fd}] ${text}`);
      }
      return s;
    }

    case "syscall": {
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Save RIP/RFLAGS",
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
          hardwareAction: "RIP loads from IA32_LSTAR",
          modifiedBuses: ["RIP"],
        },
      ];

      s = s
        .withPrivilege({ tag: "x86", ring: 0 })
        .setReg("rcx", nextPc)
        .setReg("r11", BitVec.of(64, 0x246n))
        .withMicroSteps(micro);

      const sysNr = Number(s.getReg("rax").val);
      if (sysNr === 60) {
        const code = Number(s.getReg("rdi").val);
        return s
          .withHalted(true, code)
          .withActiveLineIndex(-1)
          .appendTrace("kernel_log", `sys_exit(${code}) dispatched. Halted.`);
      }
      if (sysNr === 1) {
        const fd = s.getReg("rdi").val;
        const buf = s.getReg("rsi").val;
        const count = Number(s.getReg("rdx").val);
        const text =
          buf > 0n
            ? s.memory.readAscii(buf, count)
            : `Syscall write (${count} bytes)`;
        return s
          .setReg("rax", BitVec.of(64, count))
          .appendTrace("stdout", `[stdout fd=${fd}] ${text}`);
      }
      return s;
    }

    case "svc": {
      const esr = computeArmEsr(0x15, true, instr.imm);
      const micro: MicroOpStep[] = [
        {
          phase: 1,
          name: "Trap to EL1",
          hardwareAction: "ELR_EL1 <= next PC, SPSR_EL1 <= PSTATE",
          modifiedBuses: ["ELR_EL1", "SPSR_EL1"],
        },
        {
          phase: 2,
          name: "Syndrome Record",
          hardwareAction: `ESR_EL1 <= ${esr} (EC=0x15 SVC)`,
          modifiedBuses: ["ESR_EL1"],
        },
        {
          phase: 3,
          name: "Vector Offset",
          hardwareAction: "PC <= VBAR_EL1 + 0x400",
          modifiedBuses: ["PC"],
        },
      ];

      s = s
        .withPrivilege({ tag: "arm", el: 1, secure: false })
        .withSpecial("ELR_EL1", nextPc.toHex())
        .withSpecial("ESR_EL1", `${esr} (EC=0x15 SVC, IL=1)`)
        .withMicroSteps(micro);

      const sysNr = Number(s.getReg("x8").val);
      if (sysNr === 93) {
        const code = Number(s.getReg("x0").val);
        return s
          .withHalted(true, code)
          .withActiveLineIndex(-1)
          .appendTrace("kernel_log", `sys_exit(${code}) handled at EL1.`);
      }
      if (sysNr === 64) {
        const count = s.getReg("x2");
        const buf = s.getReg("x1").val;
        const text =
          buf > 0n
            ? s.memory.readAscii(buf, Number(count.val))
            : `Wrote ${count.toDec()} bytes`;
        return s
          .setReg("x0", count)
          .appendTrace("stdout", `[ARM64 stdout] ${text}`);
      }
      return s;
    }

    case "hvc": {
      const esr = computeArmEsr(0x16, true, instr.imm);
      s = s
        .withPrivilege({ tag: "arm", el: 2, secure: false })
        .withSpecial("ELR_EL2", nextPc.toHex())
        .withSpecial("ESR_EL2", `${esr} (EC=0x16 HVC)`)
        .withMicroSteps([
          {
            phase: 1,
            name: "Trap to Hypervisor",
            hardwareAction: "PSTATE.EL -> EL2",
            modifiedBuses: ["PSTATE"],
          },
        ]);
      const fid = s.getReg("x0").toHex();
      return s
        .setReg("x0", BitVec.zero(64))
        .appendTrace(
          "kernel_log",
          `PSCI call ${fid} processed by EL2 hypervisor.`,
        );
    }

    case "smc": {
      const esr = computeArmEsr(0x17, true, instr.imm);
      s = s
        .withPrivilege({ tag: "arm", el: 3, secure: true })
        .withSpecial("ELR_EL3", nextPc.toHex())
        .withSpecial("ESR_EL3", `${esr} (EC=0x17 SMC)`)
        .withMicroSteps([
          {
            phase: 1,
            name: "Security World Switch",
            hardwareAction: "Trap to ARM Trusted Firmware (EL3)",
            modifiedBuses: ["SCR_EL3"],
          },
        ]);
      return s
        .setReg("x0", BitVec.zero(64))
        .appendTrace("kernel_log", "SMC routed to Secure Monitor EL3.");
    }

    case "ecall": {
      s = s
        .withPrivilege({ tag: "riscv", mode: "S" })
        .withSpecial("sepc", state.pc.toHex())
        .withSpecial("scause", "8 (Environment call from U-mode)")
        .withMicroSteps([
          {
            phase: 1,
            name: "Capture PC",
            hardwareAction: "sepc <= address of ecall itself",
            modifiedBuses: ["sepc"],
          },
          {
            phase: 2,
            name: "Mode Elevation",
            hardwareAction: "Enter S-Mode (delegated via medeleg)",
            modifiedBuses: ["sstatus"],
          },
        ]);

      const sysNr = Number(s.getReg("a7").val);
      if (sysNr === 93) {
        const code = Number(s.getReg("a0").val);
        return s
          .withHalted(true, code)
          .withActiveLineIndex(-1)
          .appendTrace("kernel_log", `sys_exit(${code}) handled in S-Mode.`);
      }
      if (sysNr === 64) {
        const count = s.getReg("a2");
        const buf = s.getReg("a1").val;
        const text =
          buf > 0n
            ? s.memory.readAscii(buf, Number(count.val))
            : `Wrote ${count.toDec()} bytes`;
        return s
          .setReg("a0", count)
          .appendTrace("stdout", `[RISC-V stdout] ${text}`);
      }
      return s;
    }

    case "tdcall": {
      return s
        .withPrivilege({ tag: "tdx", domain: "SEAM" })
        .withSpecial("Intel SEAM Status", "0x0000000000000000 (TDX_SUCCESS)")
        .setReg("rax", BitVec.zero(64))
        .appendTrace(
          "kernel_log",
          "TDCALL handled by Intel SEAM module. Guest registers sanitized.",
        );
    }

    case "seamcall": {
      return s
        .withPrivilege({ tag: "tdx", domain: "SEAM" })
        .withSpecial("Intel SEAM Mode", "Active Root Operation verified")
        .setReg("rax", BitVec.zero(64))
        .appendTrace("kernel_log", "SEAMCALL verified host VMM parameters.");
    }

    // -----------------------------------------------------------------------
    // Return Instructions
    // -----------------------------------------------------------------------

    case "sysret": {
      const returnRip = s.getReg("rcx");
      const targetExec = program.executableInstructions.find(
        (e) => e.address.val === returnRip.val,
      );
      return s
        .withPrivilege({ tag: "x86", ring: 3 })
        .withPc(returnRip)
        .withActiveLineIndex(targetExec ? targetExec.lineIndex : -1)
        .appendTrace("kernel_log", "SYSRETQ: Context restored, Ring 3 active.");
    }

    case "sysexit": {
      const userEip = s.getReg("edx");
      const userEsp = s.getReg("ecx");
      const targetExec = program.executableInstructions.find(
        (e) => e.address.val === userEip.val,
      );
      return s
        .withPrivilege({ tag: "x86", ring: 3 })
        .withPc(userEip)
        .setReg("esp", userEsp)
        .withActiveLineIndex(targetExec ? targetExec.lineIndex : -1)
        .appendTrace("kernel_log", "SYSEXIT: Restored EIP/ESP, Ring 3 active.");
    }

    case "iret": {
      if (s.stack.length >= 5) {
        const [retEip, , , retEsp] = s.stack;
        const targetExec = program.executableInstructions.find(
          (e) => e.address.val === retEip.value.val,
        );
        return s
          .withPrivilege({ tag: "x86", ring: 3 })
          .withPc(retEip.value)
          .setReg("esp", retEsp.value)
          .withStack(s.stack.slice(5))
          .withActiveLineIndex(targetExec ? targetExec.lineIndex : -1)
          .appendTrace(
            "kernel_log",
            "IRET: Hardware stack popped, Ring 3 restored.",
          );
      }
      return s.withPrivilege({ tag: "x86", ring: 3 });
    }

    case "eret": {
      const targetEl = s.privilege.tag === "arm" && s.privilege.el > 1 ? 1 : 0;
      return s
        .withPrivilege({ tag: "arm", el: targetEl as 0 | 1, secure: false })
        .appendTrace(
          "kernel_log",
          `ERET: Dropped execution level to EL${targetEl}.`,
        );
    }

    case "sret": {
      const sepc = BigInt(s.specialRegisters.get("sepc") ?? "0x400000") + 4n;
      const targetPc = BitVec.of(64, sepc);
      const targetExec = program.executableInstructions.find(
        (e) => e.address.val === targetPc.val,
      );
      return s
        .withPrivilege({ tag: "riscv", mode: "U" })
        .withPc(targetPc)
        .withActiveLineIndex(targetExec ? targetExec.lineIndex : -1)
        .appendTrace("kernel_log", "SRET: Execution returned to U-Mode.");
    }

    case "seamret": {
      return s
        .withPrivilege({ tag: "tdx", domain: "TDGuest" })
        .appendTrace("kernel_log", "SEAMRET: Returned to encrypted TD Guest.");
    }

    default:
      return s;
  }
}
