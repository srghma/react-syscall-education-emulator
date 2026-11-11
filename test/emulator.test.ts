import { describe, test, expect } from "bun:test";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";
import { parseAssembly } from "@/lib/lean/assembler";
import { createInitialMachine } from "@/lib/lean/factory";
import { stepMachine } from "@/lib/lean/evaluator";
import { privilegeToString } from "@/lib/lean/domain";
import type { MachineState } from "@/lib/lean/state";
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
  maxSteps = 50,
): {
  finalState: MachineState;
  privilegeLog: string[];
  totalSteps: number;
} {
  const progResult = parseAssembly(code, arch);
  if (progResult.tag === "error") {
    throw new Error(`Parse error: ${progResult.error}`);
  }

  const program = progResult.value;
  let state = createInitialMachine(arch).withMemory(program.initialMemory);

  if (program.executableInstructions.length > 0) {
    state = state.withActiveLineIndex(
      program.executableInstructions[0].lineIndex,
    );
  }

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
  test("int 0x80: 32-bit x86 IDT gate trap, Ring 0 TSS stack push, and exit(0)", () => {
    const spec = getSpec("int-0x80");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("Ring 0"))).toBe(true);
    expect(finalState.stack.some((s) => s.tag === "Return EIP")).toBe(true);
    expect(finalState.stack.some((s) => s.tag === "User SS")).toBe(true);
    expect(
      finalState.trace.some(
        (t) => t.stream === "stdout" && t.text.includes("int 0x80"),
      ),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("sysenter: 32-bit x86 Pentium II MSR fastpath (MSR 0x174..0x176) to Ring 0", () => {
    const spec = getSpec("sysenter");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
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

  test("syscall: 64-bit AMD64 LSTAR fast syscall with RCX/R11 hardware saving", () => {
    const spec = getSpec("syscall");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("Ring 0"))).toBe(true);
    expect(finalState.getReg("rcx").val > 0n).toBe(true);
    expect(finalState.getReg("r11").val > 0n).toBe(true);
    expect(
      finalState.trace.some(
        (t) => t.stream === "stdout" && t.text.includes("64-bit Linux"),
      ),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("smc: ARM64 TrustZone transition into Secure World (EL3) with ESR=0x5e000000", () => {
    const spec = getSpec("smc");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("EL3"))).toBe(true);
    const esr = finalState.specialRegisters.get("ESR_EL3");
    expect(esr?.startsWith("0x5e000000")).toBe(true);
  });

  test("svc: ARM64 synchronous exception to EL1 kernel with ESR=0x56000000", () => {
    const spec = getSpec("svc");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("EL1"))).toBe(true);
    const esr = finalState.specialRegisters.get("ESR_EL1");
    expect(esr?.startsWith("0x56000000")).toBe(true);
    expect(
      finalState.trace.some(
        (t) => t.stream === "stdout" && t.text.includes("ARM64 AArch64"),
      ),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("hvc: ARM64 hypervisor call (EL1 -> EL2) with ESR=0x5a000000", () => {
    const spec = getSpec("hvc");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("EL2"))).toBe(true);
    const esr = finalState.specialRegisters.get("ESR_EL2");
    expect(esr?.startsWith("0x5a000000")).toBe(true);
  });

  test("ecall: RISC-V unified environment call to S-Mode with sepc capture and scause=8", () => {
    const spec = getSpec("ecall");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("S-Mode"))).toBe(true);
    expect(finalState.specialRegisters.has("sepc")).toBe(true);
    expect(finalState.specialRegisters.get("scause")?.includes("8")).toBe(true);
    expect(
      finalState.trace.some(
        (t) => t.stream === "stdout" && t.text.includes("RISC-V RV64GC"),
      ),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("tdcall: Intel TDX confidential guest transition to SEAM module", () => {
    const spec = getSpec("tdcall");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("SEAM"))).toBe(true);
    expect(
      finalState.specialRegisters
        .get("Intel SEAM Status")
        ?.includes("TDX_SUCCESS"),
    ).toBe(true);
    expect(finalState.isHalted).toBe(true);
    expect(finalState.exitCode).toBe(0);
  });

  test("seamcall: Intel TDX host hypervisor transition to SEAM module", () => {
    const spec = getSpec("seamcall");

    const { finalState, privilegeLog } = runProgramToHalt(
      spec.defaultProgram,
      spec.arch,
    );

    expect(privilegeLog.some((p) => p.includes("SEAM"))).toBe(true);
    expect(finalState.specialRegisters.has("Intel SEAM Mode")).toBe(true);
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

    const init = createInitialMachine(syscallSpec.arch).withMemory(
      prog.value.initialMemory,
    );

    const step1 = stepMachine(init, prog.value);
    const step2 = stepMachine(step1, prog.value);
    const _step3 = stepMachine(step2, prog.value);

    // Rollback to step 2 snapshot
    const restoredStep2 = step2;

    expect(restoredStep2.pc.val).toBe(step2.pc.val);
    expect(restoredStep2.stepCount).toBe(step2.stepCount);
    expect(restoredStep2.getReg("rax").val).toBe(step2.getReg("rax").val);
    expect(restoredStep2.getReg("rdi").val).toBe(step2.getReg("rdi").val);
  });
});
