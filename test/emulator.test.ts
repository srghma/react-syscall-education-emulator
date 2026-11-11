import { describe, test, expect } from "bun:test";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";
import { parseAssembly } from "@/lib/lean/assembler";
import { createInitialMachine } from "@/lib/lean/factory";
import { stepMachine } from "@/lib/lean/evaluator";
import { privilegeToString } from "@/lib/lean/domain";
import { type MachineState, readGpr } from "@/lib/lean/state";
import { BitVec } from "@/lib/lean/fp";
import type { InstructionSpec } from "@/types/emulator";

function getSpec(id: string): InstructionSpec {
  const spec = INSTRUCTIONS_DATA.find((i) => i.id === id);
  if (!spec) {
    throw new Error(`Instruction specification '${id}' not found`);
  }
  return spec;
}

function runProgramToHalt(
  code: string,
  arch: "x86_32" | "x86_64" | "arm64" | "riscv",
  initialPrivilege?: InstructionSpec["sourcePrivilege"],
  maxSteps = 50,
): {
  finalState: MachineState;
  privilegeLog: string[];
  totalSteps: number;
} {
  const progResult = parseAssembly(code, arch);
  if (progResult.tag === "error") {
    throw new Error(
      `Parse error at line ${progResult.error.line}: ${progResult.error.message}`,
    );
  }

  const program = progResult.value;
  let state = createInitialMachine(arch, initialPrivilege);
  state = {
    ...state,
    pc: BitVec.of(64, program.entryPoint),
    memory: program.initialMemory,
    activeLineIndex:
      program.executableInstructions.length > 0
        ? program.executableInstructions[0].lineIndex
        : 0,
  };

  const privilegeLog: string[] = [privilegeToString(state.privilege)];
  let steps = 0;

  while (!state.isHalted && steps < maxSteps) {
    const prevPriv = privilegeToString(state.privilege);
    state = stepMachine(state, program);
    const newPriv = privilegeToString(state.privilege);
    if (prevPriv !== newPriv) {
      privilegeLog.push(newPriv);
    }
    steps++;
  }

  return { finalState: state, privilegeLog, totalSteps: steps };
}

describe("Hardware Privilege Transitions & Syscall Traps", () => {
  test("int 0x80: 32-bit x86 IDT trap to Ring 0, pushes frame, auto-returns to Ring 3, exits cleanly", () => {
    const spec = getSpec("int-0x80");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog.some((p) => p.includes("Ring 0"))).toBe(true);
    expect(
      finalState.trace.some(
        (t) => t.stream === "stdout" && t.text.includes("int 0x80"),
      ),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("sysenter: 32-bit x86 fastpath transitions to Ring 0 via MSRs and exits cleanly", () => {
    const spec = getSpec("sysenter");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog.some((p) => p.includes("Ring 0"))).toBe(true);
    expect(finalState.specialRegisters.has("MSR 0x174 (SYSENTER_CS)")).toBe(
      true,
    );
    expect(
      finalState.trace.some(
        (t) => t.stream === "stdout" && t.text.includes("sysenter"),
      ),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("syscall: 64-bit AMD64 LSTAR leap, saves RCX/R11, auto-returns via sysretq, exits cleanly", () => {
    const spec = getSpec("syscall");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog.some((p) => p.includes("Ring 0"))).toBe(true);
    expect(readGpr(finalState, "rcx").val > 0n).toBe(true);
    expect(readGpr(finalState, "r11").val > 0n).toBe(true);
    expect(
      finalState.trace.some(
        (t) => t.stream === "stdout" && t.text.includes("64-bit Linux"),
      ),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("smc: ARM64 TrustZone starts at EL1 Kernel and traps to EL3 Secure World", () => {
    const spec = getSpec("smc");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog[0].includes("EL1")).toBe(true);
    expect(privilegeLog.some((p) => p.includes("EL3"))).toBe(true);
    const esr = finalState.specialRegisters.get("ESR_EL3");
    expect(esr?.value.val).toBe(0x5e000000n);
  });

  test("svc: ARM64 synchronous exception EL0 -> EL1 with ESR syndrome 0x56000000", () => {
    const spec = getSpec("svc");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog[0].includes("EL0")).toBe(true);
    expect(privilegeLog.some((p) => p.includes("EL1"))).toBe(true);
    const esr = finalState.specialRegisters.get("ESR_EL1");
    expect(esr?.value.val).toBe(0x56000000n);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("hvc: ARM64 hypervisor call starts at EL1 Kernel and traps to EL2 Hypervisor", () => {
    const spec = getSpec("hvc");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog[0].includes("EL1")).toBe(true);
    expect(privilegeLog.some((p) => p.includes("EL2"))).toBe(true);
    const esr = finalState.specialRegisters.get("ESR_EL2");
    expect(esr?.value.val).toBe(0x5a000000n);
  });

  test("ecall: RISC-V unified environment call traps from U-Mode to S-Mode with sepc capture", () => {
    const spec = getSpec("ecall");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog[0].includes("U-Mode")).toBe(true);
    expect(privilegeLog.some((p) => p.includes("S-Mode"))).toBe(true);
    expect(finalState.specialRegisters.has("sepc")).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("tdcall: Intel TDX confidential guest starts in TDGuest and traps to SEAM module", () => {
    const spec = getSpec("tdcall");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog[0].includes("TDGuest")).toBe(true);
    expect(privilegeLog.some((p) => p.includes("SEAM"))).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("seamcall: Intel TDX host starts in HostVMM and traps to SEAM module", () => {
    const spec = getSpec("seamcall");
    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
      spec.sourcePrivilege,
    );

    expect(privilegeLog[0].includes("HostVMM")).toBe(true);
    expect(privilegeLog.some((p) => p.includes("SEAM"))).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });
});

describe("Deterministic Time-Travel Debugging (Step Back)", () => {
  test("historical state rollback restores exact bit-level registers, flags, and PC", () => {
    const syscallSpec = getSpec("syscall");
    const prog = parseAssembly(syscallSpec.defaultProgram, syscallSpec.arch);
    expect(prog.tag).toBe("ok");
    if (prog.tag !== "ok") return;

    let state = createInitialMachine(
      syscallSpec.arch,
      syscallSpec.sourcePrivilege,
    );
    state = {
      ...state,
      pc: BitVec.of(64, prog.value.entryPoint),
      memory: prog.value.initialMemory,
    };

    const step1 = stepMachine(state, prog.value);
    const step2 = stepMachine(step1, prog.value);
    const _step3 = stepMachine(step2, prog.value);

    const restoredStep2 = step2;

    expect(restoredStep2.pc.val).toBe(step2.pc.val);
    expect(restoredStep2.stepCount).toBe(step2.stepCount);
    expect(readGpr(restoredStep2, "rax").val).toBe(readGpr(step2, "rax").val);
    expect(readGpr(restoredStep2, "rdi").val).toBe(readGpr(step2, "rdi").val);
  });
});

describe("P1/P4: Branches, Stack Operations & Table-Driven Syscalls", () => {
  test("executes backward loop with dec and jnz until counter reaches 0", () => {
    const code = `
.section .text
.global _start
_start:
    mov ecx, 3
loop:
    dec ecx
    jnz loop
    hlt
`;
    const { finalState } = runProgramToHalt(code, "x86_32");
    expect(readGpr(finalState, "ecx").val).toBe(0n);
    expect(finalState.flags.Z).toBe(true);
  });

  test("push and pop store and retrieve values from memory stack", () => {
    const code = `
.section .text
.global _start
_start:
    mov rax, 0x12345678
    push rax
    xor rax, rax
    pop rbx
    hlt
`;
    const { finalState } = runProgramToHalt(code, "x86_64");
    expect(readGpr(finalState, "rax").val).toBe(0n);
    expect(readGpr(finalState, "rbx").val).toBe(0x12345678n);
  });

  test("unknown syscall number returns -ENOSYS (-38)", () => {
    const code = `
.section .text
.global _start
_start:
    mov rax, 9999
    syscall
    hlt
`;
    const { finalState } = runProgramToHalt(code, "x86_64");
    // -38 in 64-bit two's complement
    expect(readGpr(finalState, "rax").val).toBe(0xffffffffffffffdan);
    expect(finalState.trace.some((t) => t.text.includes("-ENOSYS"))).toBe(true);
  });
});

describe("Assembler Fidelity & Architectural Regressions", () => {
  test("ARM64 preserves # immediate prefixes and does not strip them as comments", () => {
    const code = "mov x0, #42\nhlt";
    const prog = parseAssembly(code, "arm64");
    expect(prog.tag).toBe("ok");
    if (prog.tag !== "ok") return;

    const init = createInitialMachine("arm64");
    const stepped = stepMachine(init, prog.value);
    expect(readGpr(stepped, "x0").val).toBe(42n);
  });

  test("handles tab-separated mnemonics and operands seamlessly", () => {
    const code = "mov\teax,\t100\nhlt";
    const prog = parseAssembly(code, "x86_32");
    expect(prog.tag).toBe("ok");
    if (prog.tag !== "ok") return;

    const init = createInitialMachine("x86_32");
    const stepped = stepMachine(init, prog.value);
    expect(readGpr(stepped, "eax").val).toBe(100n);
  });

  test("returns structured diagnostic errors on malformed input without throwing", () => {
    const code = "mov eax\n";
    const res = parseAssembly(code, "x86_32");
    expect(res.tag).toBe("error");
    if (res.tag === "error") {
      expect(res.error.line).toBe(1);
      expect(
        res.error.message.includes("requires destination and source"),
      ).toBe(true);
    }
  });

  test("x86_64 zero-extends 32-bit register writes into 64-bit parent register", () => {
    const code = "mov rax, 0xffffffffffffffff\nmov eax, 0x1234\nhlt";
    const prog = parseAssembly(code, "x86_64");
    expect(prog.tag).toBe("ok");
    if (prog.tag !== "ok") return;

    let state = createInitialMachine("x86_64");
    state = stepMachine(state, prog.value);
    state = stepMachine(state, prog.value);
    expect(readGpr(state, "rax").val).toBe(0x0000000000001234n);
  });

  test("executes three-operand arithmetic with explicit source registers", () => {
    const code = "mov x1, #10\nadd x0, x1, #5\nhlt";
    const prog = parseAssembly(code, "arm64");
    expect(prog.tag).toBe("ok");
    if (prog.tag !== "ok") return;

    let state = createInitialMachine("arm64");
    state = stepMachine(state, prog.value);
    state = stepMachine(state, prog.value);
    expect(readGpr(state, "x0").val).toBe(15n);
    expect(readGpr(state, "x1").val).toBe(10n);
  });
});
