import type {
  CpuArch,
  InstructionSpec,
  MachineState,
  TraceEvent,
} from "@/types/emulator";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";

export function cleanSourceLine(rawLine: string, arch: CpuArch): string {
  let line = rawLine.replace(/\/\*.*?\*\//g, "");

  if (arch === "arm64") {
    const slashIdx = line.indexOf("//");
    const atIdx = line.indexOf("@");
    let cutIdx = -1;
    if (slashIdx !== -1 && atIdx !== -1) cutIdx = Math.min(slashIdx, atIdx);
    else if (slashIdx !== -1) cutIdx = slashIdx;
    else if (atIdx !== -1) cutIdx = atIdx;
    if (cutIdx !== -1) line = line.substring(0, cutIdx);
  } else {
    const match = line.match(/[#;//]/);
    if (match && match.index !== undefined) {
      line = line.substring(0, match.index);
    }
  }

  return line.trim();
}

export function isExecutableInstruction(line: string): boolean {
  if (!line) return false;
  if (line.startsWith(".")) return false;
  if (line.endsWith(":")) return false;
  return true;
}

export function readRegister(
  regs: Record<string, bigint>,
  regName: string,
  arch: CpuArch,
): bigint {
  const r = regName.toLowerCase();
  if (arch === "riscv" && (r === "zero" || r === "x0")) return 0n;
  if (arch === "arm64" && (r === "xzr" || r === "wzr")) return 0n;

  if (arch === "x86_64") {
    if (r === "eax") return BigInt.asUintN(32, regs.rax ?? 0n);
    if (r === "ebx") return BigInt.asUintN(32, regs.rbx ?? 0n);
    if (r === "ecx") return BigInt.asUintN(32, regs.rcx ?? 0n);
    if (r === "edx") return BigInt.asUintN(32, regs.rdx ?? 0n);
    if (r === "edi") return BigInt.asUintN(32, regs.rdi ?? 0n);
    if (r === "esi") return BigInt.asUintN(32, regs.rsi ?? 0n);
  }

  if (arch === "arm64" && r.startsWith("w")) {
    const parentX = `x${r.slice(1)}`;
    if (Object.hasOwn(regs, parentX)) {
      return BigInt.asUintN(32, regs[parentX]);
    }
  }

  return Object.hasOwn(regs, r) ? regs[r] : 0n;
}

export function writeRegister(
  regs: Record<string, bigint>,
  regName: string,
  val: bigint,
  arch: CpuArch,
): void {
  const r = regName.toLowerCase();
  if (arch === "riscv" && (r === "zero" || r === "x0")) return;
  if (arch === "arm64" && (r === "xzr" || r === "wzr")) return;

  if (arch === "x86_64") {
    if (r === "eax") {
      regs.rax = BigInt.asUintN(32, val);
      return;
    }
    if (r === "ebx") {
      regs.rbx = BigInt.asUintN(32, val);
      return;
    }
    if (r === "ecx") {
      regs.rcx = BigInt.asUintN(32, val);
      return;
    }
    if (r === "edx") {
      regs.rdx = BigInt.asUintN(32, val);
      return;
    }
    if (r === "edi") {
      regs.rdi = BigInt.asUintN(32, val);
      return;
    }
    if (r === "esi") {
      regs.rsi = BigInt.asUintN(32, val);
      return;
    }
  }

  if (arch === "arm64" && r.startsWith("w")) {
    const parentX = `x${r.slice(1)}`;
    regs[parentX] = BigInt.asUintN(32, val);
    return;
  }

  const width = arch === "x86_32" ? 32 : 64;
  regs[r] = BigInt.asUintN(width, val);
}

export function parseImmediate(token: string): bigint {
  const clean = token.trim().replace(/^[#$]/, "");
  const isNegative = clean.startsWith("-");
  const absToken = isNegative ? clean.substring(1) : clean;
  let val = 0n;
  if (absToken.startsWith("0x") || absToken.startsWith("0X")) {
    val = BigInt(absToken);
  } else if (absToken.startsWith("0b") || absToken.startsWith("0B")) {
    val = BigInt(absToken);
  } else {
    val = BigInt(absToken);
  }
  return isNegative ? -val : val;
}

export function createInitialState(
  arch: CpuArch,
  instructionId: string,
): MachineState {
  const spec =
    INSTRUCTIONS_DATA.find((i: InstructionSpec) => i.id === instructionId) ??
    INSTRUCTIONS_DATA[0];

  const registers: Record<string, bigint> = {};
  const specialRegisters: Record<string, string | bigint> = {};

  if (arch === "x86_32") {
    for (const r of ["eax", "ebx", "ecx", "edx", "esi", "edi", "ebp", "esp"]) {
      registers[r] = 0n;
    }
    registers.esp = 0xbf800000n;
    specialRegisters.IDTR = "0x80000000 (Limit: 0x07FF)";
    specialRegisters["MSR 0x174 (SYSENTER_CS)"] = "0x0060 (Kernel CS)";
    specialRegisters["MSR 0x175 (SYSENTER_ESP)"] = "0xc0002000 (Kernel ESP0)";
    specialRegisters["MSR 0x176 (SYSENTER_EIP)"] =
      "0xc0001000 (sysenter_entry)";
  } else if (arch === "x86_64") {
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
      registers[r] = 0n;
    }
    registers.rsp = 0x7fffffffe000n;
    specialRegisters.IA32_LSTAR = "0xffffffff81e00000 (entry_SYSCALL_64)";
    specialRegisters.IA32_STAR = "0x0023001000000000";
    specialRegisters.IA32_FMASK = "0x0000000000047700 (Mask TF, IF, DF, AC)";
  } else if (arch === "arm64") {
    for (let i = 0; i <= 30; i++) registers[`x${i}`] = 0n;
    registers.sp = 0x0000ffffffffb000n;
    specialRegisters.ELR_EL1 = 0n;
    specialRegisters.SPSR_EL1 = "0x00000000 (EL0t, interrupts unmasked)";
    specialRegisters.ESR_EL1 = 0n;
    specialRegisters.VBAR_EL1 = "0xffff800008080000";
  } else if (arch === "riscv") {
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
      registers[r] = 0n;
    }
    registers.sp = 0x7ffffff0n;
    specialRegisters.sepc = 0n;
    specialRegisters.scause = 0n;
    specialRegisters.stvec = "0x80000000 (Supervisor Trap Base)";
    specialRegisters.sstatus = "0x00000000 (SPP=U, SPIE=0)";
    specialRegisters.medeleg = "0x00000100 (Delegate U-Mode ecall to S-Mode)";
  }

  return {
    arch,
    activeInstructionId: instructionId,
    pc: 0x00400000n,
    privilege: spec.sourcePrivilege,
    registers,
    flags: { n: false, z: false, c: false, v: false },
    specialRegisters,
    stack: [
      {
        address: registers.esp || registers.rsp || registers.sp || 0x1000n,
        value: 0n,
        label: "Initial User Stack Top",
      },
    ],
    trace: [],
    isHalted: false,
    exitCode: null,
    history: [],
    microStepsExecuted: [],
    currentLineIndex: 0,
    stepCount: 0,
  };
}

export function stepEmulator(
  state: MachineState,
  lines: string[],
): MachineState {
  if (state.isHalted || state.currentLineIndex >= lines.length) {
    return { ...state, isHalted: true };
  }

  let lineIdx = state.currentLineIndex;
  let cleaned = "";
  while (lineIdx < lines.length) {
    cleaned = cleanSourceLine(lines[lineIdx], state.arch);
    if (cleaned.includes(":") && !cleaned.endsWith(":")) {
      cleaned = cleaned.substring(cleaned.indexOf(":") + 1).trim();
    }
    if (isExecutableInstruction(cleaned)) break;
    lineIdx++;
  }

  if (lineIdx >= lines.length || !cleaned) {
    return { ...state, isHalted: true, currentLineIndex: lineIdx };
  }

  const rawLine = lines[lineIdx];
  const nextPc = state.pc + 4n;
  const currentStep = state.stepCount + 1;

  const firstSpace = cleaned.indexOf(" ");
  const mnemonic = (
    firstSpace === -1 ? cleaned : cleaned.substring(0, firstSpace)
  ).toLowerCase();
  const argsStr = firstSpace === -1 ? "" : cleaned.substring(firstSpace).trim();
  const args = argsStr ? argsStr.split(",").map((s) => s.trim()) : [];

  const newRegs = { ...state.registers };
  const newSpecial = { ...state.specialRegisters };
  const newStack = [...state.stack];
  const newTrace: TraceEvent[] = [...state.trace];
  const newFlags = { ...state.flags };
  let newPrivilege = state.privilege;
  let newExitCode: number | null = state.exitCode;
  let isHalted: boolean = state.isHalted;

  const isTransition = [
    "syscall",
    "sysenter",
    "int",
    "svc",
    "hvc",
    "smc",
    "ecall",
    "tdcall",
    "seamcall",
  ].includes(mnemonic);

  if (isTransition) {
    const targetSpec =
      INSTRUCTIONS_DATA.find((i: InstructionSpec) => {
        if (i.arch !== state.arch) return false;
        if (mnemonic === "int") return i.id === "int-0x80";
        if (mnemonic === "svc") return i.id === "svc";
        if (mnemonic === "hvc") return i.id === "hvc";
        if (mnemonic === "smc") return i.id === "smc";
        return i.mnemonic.toLowerCase() === mnemonic;
      }) ??
      INSTRUCTIONS_DATA.find(
        (i: InstructionSpec) => i.id === state.activeInstructionId,
      ) ??
      INSTRUCTIONS_DATA[0];

    newPrivilege = targetSpec.targetPrivilege;

    if (state.arch === "x86_32") {
      if (mnemonic === "int") {
        const userEsp = readRegister(newRegs, "esp", "x86_32");
        newStack.unshift(
          { address: 0xc0001ffcn, value: 0x0000007bn, label: "User SS" },
          { address: 0xc0001ff8n, value: userEsp, label: "User ESP" },
          { address: 0xc0001ff4n, value: 0x00000246n, label: "User EFLAGS" },
          { address: 0xc0001ff0n, value: 0x00000073n, label: "User CS" },
          { address: 0xc0001fecn, value: nextPc, label: "Return EIP" },
        );
        newSpecial["Last Trapped Vector"] = "0x80 (IDT Gate Handler)";
      }

      const syscallNr = Number(readRegister(newRegs, "eax", "x86_32"));
      if (syscallNr === 1) {
        newExitCode = Number(readRegister(newRegs, "ebx", "x86_32"));
        isHalted = true;
        newTrace.push({
          stream: "kernel_log",
          text: `[Kernel Ring 0] sys_exit(${newExitCode}) received. Process terminated.`,
          step: currentStep,
        });
      } else if (syscallNr === 4) {
        const count = readRegister(newRegs, "edx", "x86_32");
        newTrace.push({
          stream: "stdout",
          text: `[stdout] sys_write: ${count} bytes written`,
          step: currentStep,
        });
        writeRegister(newRegs, "eax", count, "x86_32");
      }
    } else if (state.arch === "x86_64") {
      if (mnemonic === "syscall") {
        newRegs.rcx = nextPc;
        newRegs.r11 = 0x246n;
        const nr = Number(readRegister(newRegs, "rax", "x86_64"));
        if (nr === 60) {
          newExitCode = Number(readRegister(newRegs, "rdi", "x86_64"));
          isHalted = true;
          newTrace.push({
            stream: "kernel_log",
            text: `[Kernel Ring 0] 64-bit sys_exit(${newExitCode}). Execution halted.`,
            step: currentStep,
          });
        }
      }
    } else if (state.arch === "arm64") {
      if (mnemonic === "svc") {
        newSpecial.ELR_EL1 = nextPc;
        newSpecial.ESR_EL1 = "0x56000000 (EC=0x15 SVC, IL=1)";
        const nr = Number(readRegister(newRegs, "x8", "arm64"));
        if (nr === 93) {
          newExitCode = Number(readRegister(newRegs, "x0", "arm64"));
          isHalted = true;
          newTrace.push({
            stream: "kernel_log",
            text: `[Linux AArch64 EL1] sys_exit(${newExitCode}) handled at EL1.`,
            step: currentStep,
          });
        }
      }
    } else if (state.arch === "riscv") {
      newSpecial.sepc = state.pc;
      newSpecial.scause = "8 (Environment call from U-mode)";
      const nr = Number(readRegister(newRegs, "a7", "riscv"));
      if (nr === 93) {
        newExitCode = Number(readRegister(newRegs, "a0", "riscv"));
        isHalted = true;
        newTrace.push({
          stream: "kernel_log",
          text: `[RISC-V S-Mode] ecall handled sys_exit(${newExitCode}).`,
          step: currentStep,
        });
      }
    }

    return {
      ...state,
      pc: nextPc,
      privilege: newPrivilege,
      registers: newRegs,
      specialRegisters: newSpecial,
      stack: newStack,
      trace: newTrace,
      flags: newFlags,
      isHalted,
      exitCode: newExitCode,
      microStepsExecuted: targetSpec.hardwareSteps,
      currentLineIndex: lineIdx + 1,
      stepCount: currentStep,
      history: [
        ...state.history,
        `[Elevation] ${rawLine.trim()} -> ${newPrivilege}`,
      ],
    };
  }

  // General Instructions
  try {
    if (mnemonic === "mov" || mnemonic === "li") {
      const dest = args[0];
      const val = Object.hasOwn(newRegs, args[1]?.toLowerCase())
        ? readRegister(newRegs, args[1], state.arch)
        : parseImmediate(args[1]);
      writeRegister(newRegs, dest, val, state.arch);
    } else if (mnemonic === "xor") {
      writeRegister(newRegs, args[0], 0n, state.arch);
    } else if (mnemonic === "hlt") {
      return {
        ...state,
        isHalted: true,
        currentLineIndex: lineIdx + 1,
        stepCount: currentStep,
      };
    }
  } catch (err) {
    newTrace.push({
      stream: "stderr",
      text: `Execution fault: ${err instanceof Error ? err.message : String(err)}`,
      step: currentStep,
    });
  }

  return {
    ...state,
    pc: nextPc,
    registers: newRegs,
    flags: newFlags,
    currentLineIndex: lineIdx + 1,
    microStepsExecuted: [],
    stepCount: currentStep,
    history: state.history,
  };
}
