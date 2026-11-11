import type { CpuArch, MachineState, TraceEvent } from "@/types/emulator";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";

export function createInitialState(
  arch: CpuArch,
  instructionId: string,
): MachineState {
  const spec =
    INSTRUCTIONS_DATA.find((i) => i.id === instructionId) ??
    INSTRUCTIONS_DATA[0];

  const registers: Record<string, bigint> = {};
  const specialRegisters: Record<string, string | bigint> = {};

  if (arch === "x86_32") {
    ["eax", "ebx", "ecx", "edx", "esi", "edi", "ebp", "esp"].forEach((r) => {
      registers[r] = 0n;
    });
    registers.esp = 0xbf800000n; // Standard 32-bit Linux user stack
    specialRegisters.IDTR = "0x80000000 (Limit: 0x07FF)";
    specialRegisters["MSR 0x174 (SYSENTER_CS)"] = "0x0060 (Kernel CS)";
    specialRegisters["MSR 0x175 (SYSENTER_ESP)"] = "0xc0002000 (Kernel ESP)";
    specialRegisters["MSR 0x176 (SYSENTER_EIP)"] =
      "0xc0001000 (sysenter_entry)";
  } else if (arch === "x86_64") {
    [
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
    ].forEach((r) => {
      registers[r] = 0n;
    });
    registers.rsp = 0x7fffffffe000n; // 64-bit user stack
    specialRegisters.IA32_LSTAR = "0xffffffff81e00000 (entry_SYSCALL_64)";
    specialRegisters.IA32_STAR = "0x0023001000000000";
    specialRegisters.IA32_FMASK = "0x0000000000000200 (Mask IF)";
    if (instructionId === "tdcall" || instructionId === "seamcall") {
      specialRegisters.SEAMRR_BASE = "0x78000000 (Locked)";
      specialRegisters.SEAMRR_MASK = "0x7c000000";
      specialRegisters.KEYID_MAX = "64 Cryptographic KeyIDs";
    }
  } else if (arch === "arm64") {
    for (let i = 0; i <= 30; i++) {
      registers[`x${i}`] = 0n;
    }
    registers.sp = 0x0000ffffffffb000n;
    specialRegisters.ELR_EL1 = 0n;
    specialRegisters.SPSR_EL1 = 0n;
    specialRegisters.ESR_EL1 = 0n;
    specialRegisters.VBAR_EL1 = "0xffff800008080000";
    specialRegisters.ELR_EL2 = 0n;
    specialRegisters.ESR_EL2 = 0n;
    specialRegisters.VBAR_EL2 = "0xffff800009000000";
    specialRegisters.ELR_EL3 = 0n;
    specialRegisters.ESR_EL3 = 0n;
    specialRegisters.VBAR_EL3 = "0x04000000";
  } else if (arch === "riscv") {
    [
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
    ].forEach((r) => {
      registers[r] = 0n;
    });
    registers.sp = 0x7ffffff0n;
    specialRegisters.sepc = 0n;
    specialRegisters.scause = 0n;
    specialRegisters.stvec = "0x80000000 (Supervisor Trap Base)";
    specialRegisters.sstatus = "0x00000000 (SPP=U, SPIE=0)";
    specialRegisters.mepc = 0n;
    specialRegisters.mcause = 0n;
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
        address:
          registers.esp || registers.rsp || registers.sp || 0x1000n,
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
  };
}

/**
 * Parses numeric immediates in hex (0x...), binary (0b...), or decimal
 */
export function parseImmediate(token: string): bigint {
  const clean = token.trim().replace(/^#/, "").replace(/#.*$/, "");
  if (clean.startsWith("0x") || clean.startsWith("0X")) {
    return BigInt(clean);
  }
  if (clean.startsWith("0b") || clean.startsWith("0B")) {
    return BigInt(clean);
  }
  return BigInt(clean);
}

/**
 * Pure functional single-step emulator for the given state and assembly lines.
 */
export function stepEmulator(
  state: MachineState,
  lines: string[],
): MachineState {
  if (state.isHalted || state.currentLineIndex >= lines.length) {
    return { ...state, isHalted: true };
  }

  // Find next non-empty, non-comment line
  let lineIdx = state.currentLineIndex;
  while (lineIdx < lines.length) {
    const raw = lines[lineIdx].trim();
    if (
      raw &&
      !raw.startsWith("#") &&
      !raw.startsWith("//") &&
      !raw.endsWith(":")
    ) {
      break;
    }
    lineIdx++;
  }

  if (lineIdx >= lines.length) {
    return { ...state, isHalted: true, currentLineIndex: lineIdx };
  }

  const rawLine = lines[lineIdx];
  const cleaned = rawLine.split("#")[0].split("//")[0].trim();
  const nextPc = state.pc + 4n;

  // Split mnemonic from arguments
  const firstSpace = cleaned.indexOf(" ");
  const mnemonic = (
    firstSpace === -1 ? cleaned : cleaned.substring(0, firstSpace)
  ).toLowerCase();
  const argsStr = firstSpace === -1 ? "" : cleaned.substring(firstSpace).trim();
  const args = argsStr.split(",").map((s) => s.trim());

  const spec = INSTRUCTIONS_DATA.find(
    (i) => i.id === state.activeInstructionId,
  );

  // Check if this line is our target hardware transition instruction
  const isTransitionInstruction =
    mnemonic === "syscall" ||
    mnemonic === "sysenter" ||
    mnemonic === "int" ||
    mnemonic === "svc" ||
    mnemonic === "hvc" ||
    mnemonic === "smc" ||
    mnemonic === "ecall" ||
    mnemonic === "tdcall" ||
    mnemonic === "seamcall";

  if (isTransitionInstruction && spec) {
    // 1. Hardware micro-steps executed
    const microSteps = spec.hardwareSteps;
    const newPrivilege = spec.targetPrivilege;

    // 2. Compute architecture-specific mutations
    const newRegs = { ...state.registers };
    const newSpecial = { ...state.specialRegisters };
    const newStack = [...state.stack];
    const newTrace: TraceEvent[] = [...state.trace];
    let newExitCode = state.exitCode;
    let halted: boolean = state.isHalted;

    if (state.arch === "x86_32") {
      const syscallNr = Number(newRegs.eax ?? 0n);
      if (mnemonic === "int") {
        // Push user SS, ESP, EFLAGS, CS, EIP to kernel stack (simulated)
        const oldEsp = newRegs.esp;
        newStack.unshift(
          { address: 0xc0001ff0n, value: oldEsp, label: "Saved User ESP" },
          {
            address: 0xc0001ff4n,
            value: 0x00000246n,
            label: "Saved User EFLAGS",
          },
          { address: 0xc0001ff8n, value: 0x00000073n, label: "Saved User CS" },
          {
            address: 0xc0001ffcn,
            value: nextPc,
            label: "Saved User Return EIP",
          },
        );
        newSpecial["Last Trapped Vector"] = "0x80 (IDT Syscall)";
      }

      // Linux 32-bit dispatch:
      if (syscallNr === 1) {
        // sys_exit
        newExitCode = Number(newRegs.ebx ?? 0n);
        halted = true;
        newTrace.push({
          stream: "kernel_log",
          text: `[Kernel Ring 0] sys_exit called with status code ${newExitCode}. Process terminated.`,
          timestamp: Date.now(),
        });
      } else if (syscallNr === 4) {
        // sys_write
        const fd = newRegs.ebx;
        const count = newRegs.edx;
        const output = `[stdout] Simulated wrote ${count} bytes to fd ${fd}`;
        newTrace.push({
          stream: "stdout",
          text: output,
          timestamp: Date.now(),
        });
        newRegs.eax = count; // return byte count
      }
    } else if (state.arch === "x86_64") {
      if (mnemonic === "syscall") {
        newRegs.rcx = nextPc; // RCX gets return RIP
        newRegs.r11 = 0x246n; // R11 gets RFLAGS
        const nr = Number(newRegs.rax ?? 0n);
        if (nr === 60) {
          // sys_exit
          newExitCode = Number(newRegs.rdi ?? 0n);
          halted = true;
          newTrace.push({
            stream: "kernel_log",
            text: `[Kernel Ring 0] 64-bit sys_exit(${newExitCode}). Halted gracefully.`,
            timestamp: Date.now(),
          });
        } else if (nr === 1) {
          // sys_write
          const count = newRegs.rdx ?? 0n;
          newTrace.push({
            stream: "stdout",
            text: `[stdout] sys_write: Wrote ${count} bytes to fd ${newRegs.rdi ?? 1n}`,
            timestamp: Date.now(),
          });
          newRegs.rax = count;
        }
      } else if (mnemonic === "tdcall") {
        const leaf = newRegs.rax ?? 0n;
        newSpecial["Intel SEAM Status"] = "0x0000000000000000 (TDX_SUCCESS)";
        newTrace.push({
          stream: "kernel_log",
          text: `[Intel SEAM Module] tdcall invoked with Leaf ${leaf} (TDG.VP.VMCALL). Cleaned guest secrets & signaled VMM.`,
          timestamp: Date.now(),
        });
        newRegs.rax = 0n; // SUCCESS
      } else if (mnemonic === "seamcall") {
        const leaf = newRegs.rax ?? 0n;
        newSpecial["Intel SEAM Mode"] = "Active Root Operation verified";
        newTrace.push({
          stream: "kernel_log",
          text: `[Host Hypervisor] seamcall invoked with Leaf ${leaf}. Cryptographic container verified by SEAM.`,
          timestamp: Date.now(),
        });
        newRegs.rax = 0n; // TDX_SUCCESS
      }
    } else if (state.arch === "arm64") {
      if (mnemonic === "svc") {
        newSpecial.ELR_EL1 = nextPc;
        newSpecial.ESR_EL1 = "0x56000000 (EC=0x15 SVC, IL=1, ISS=0)";
        newSpecial.SPSR_EL1 = "0x60000000 (NZCV=0b0110)";
        const nr = Number(newRegs.x8 ?? 0n);
        if (nr === 93) {
          // sys_exit
          newExitCode = Number(newRegs.x0 ?? 0n);
          halted = true;
          newTrace.push({
            stream: "kernel_log",
            text: `[Linux AArch64 EL1] sys_exit(${newExitCode}) via svc #0. Exception Level EL1 handled request.`,
            timestamp: Date.now(),
          });
        } else if (nr === 64) {
          // sys_write
          const count = newRegs.x2 ?? 0n;
          newTrace.push({
            stream: "stdout",
            text: `[ARM64 stdout] svc #0 sys_write wrote ${count} bytes to fd ${newRegs.x0 ?? 1n}`,
            timestamp: Date.now(),
          });
          newRegs.x0 = count;
        }
      } else if (mnemonic === "hvc") {
        newSpecial.ELR_EL2 = nextPc;
        newSpecial.ESR_EL2 = "0x58000000 (EC=0x16 HVC)";
        const fnId = newRegs.x0 ?? 0n;
        newTrace.push({
          stream: "kernel_log",
          text: `[Hypervisor EL2] hvc #0 invoked Function ID: 0x${fnId.toString(16)} (PSCI). CPU core powered on.`,
          timestamp: Date.now(),
        });
        newRegs.x0 = 0n; // PSCI_SUCCESS
      } else if (mnemonic === "smc") {
        newSpecial.ELR_EL3 = nextPc;
        newSpecial.ESR_EL3 = "0x5a000000 (EC=0x17 SMC)";
        newTrace.push({
          stream: "kernel_log",
          text: `[Secure Monitor EL3 / TrustZone] smc #0 invoked SMCCC runtime dispatcher. Switched to Secure World.`,
          timestamp: Date.now(),
        });
        newRegs.x0 = 0n;
      }
    } else if (state.arch === "riscv") {
      newSpecial.sepc = nextPc;
      newSpecial.scause = "8 (Environment call from U-mode)";
      newSpecial.sstatus = "0x00000020 (SPP=User, SPIE=1, SIE=0)";
      const nr = Number(newRegs.a7 ?? 0n);
      if (nr === 93) {
        newExitCode = Number(newRegs.a0 ?? 0n);
        halted = true;
        newTrace.push({
          stream: "kernel_log",
          text: `[RISC-V S-Mode] ecall handled sys_exit(${newExitCode}).`,
          timestamp: Date.now(),
        });
      } else if (nr === 64) {
        const count = newRegs.a2 ?? 0n;
        newTrace.push({
          stream: "stdout",
          text: `[RISC-V stdout] ecall sys_write: Wrote ${count} bytes to fd ${newRegs.a0 ?? 1n}`,
          timestamp: Date.now(),
        });
        newRegs.a0 = count;
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
      isHalted: halted,
      exitCode: newExitCode,
      microStepsExecuted: microSteps,
      currentLineIndex: lineIdx + 1,
      history: [
        ...state.history,
        `[Transition] ${rawLine.trim()} -> Elevated to ${newPrivilege}`,
      ],
    };
  }

  // General-purpose instruction execution (mov, xor, li, ldr, add, etc.)
  const newRegs = { ...state.registers };
  const historyMsg: string[] = [];

  try {
    if (mnemonic === "mov" || mnemonic === "li") {
      const dest = args[0].toLowerCase();
      const srcToken = args[1];
      if (srcToken) {
        const val =
          srcToken in newRegs ? newRegs[srcToken] : parseImmediate(srcToken);
        newRegs[dest] = val;
        historyMsg.push(
          `${dest.toUpperCase()} := ${val.toString()} (0x${val.toString(16)})`,
        );
      }
    } else if (mnemonic === "xor") {
      const dest = args[0].toLowerCase();
      const src = args[1]?.toLowerCase();
      if (dest === src) {
        newRegs[dest] = 0n;
        historyMsg.push(`${dest.toUpperCase()} := 0 (cleared)`);
      }
    } else if (mnemonic === "add") {
      const dest = args[0].toLowerCase();
      const srcToken = args[1];
      const val =
        srcToken in newRegs ? newRegs[srcToken] : parseImmediate(srcToken);
      newRegs[dest] = (newRegs[dest] ?? 0n) + val;
      historyMsg.push(`${dest.toUpperCase()} += ${val.toString()}`);
    } else if (mnemonic === "sub") {
      const dest = args[0].toLowerCase();
      const srcToken = args[1];
      const val =
        srcToken in newRegs ? newRegs[srcToken] : parseImmediate(srcToken);
      newRegs[dest] = (newRegs[dest] ?? 0n) - val;
      historyMsg.push(`${dest.toUpperCase()} -= ${val.toString()}`);
    } else if (mnemonic === "hlt") {
      return {
        ...state,
        isHalted: true,
        currentLineIndex: lineIdx + 1,
        history: [...state.history, `HLT: CPU paused execution.`],
      };
    }
  } catch (err) {
    historyMsg.push(
      `[Note] Evaluated instruction '${cleaned}' (${err instanceof Error ? err.message : ""})`,
    );
  }

  return {
    ...state,
    pc: nextPc,
    registers: newRegs,
    currentLineIndex: lineIdx + 1,
    microStepsExecuted: [],
    history: [...state.history, ...historyMsg],
  };
}
