interface SpecialRegistersProps {
  specialRegisters: Record<string, string | bigint>;
  privilege: string;
}

const REGISTER_EXPLANATIONS: Record<string, string> = {
  IDTR: "Interrupt Descriptor Table Register. Holds base and limit of hardware gate vectors used by int 0x80.",
  "MSR 0x174 (SYSENTER_CS)":
    "Kernel Code Segment MSR. Hardware sets CS = MSR 0x174 and SS = MSR 0x174 + 8 on sysenter.",
  "MSR 0x175 (SYSENTER_ESP)":
    "Kernel Stack Pointer MSR. Hardware loads ESP directly with this address on sysenter.",
  "MSR 0x176 (SYSENTER_EIP)":
    "Kernel Entry IP MSR. Hardware branches directly to this address on sysenter without reading memory tables.",
  IA32_LSTAR:
    "Long System Target Address Register (0xC0000082). RIP is loaded directly with this address on syscall.",
  IA32_STAR:
    "System Target Address Register (0xC0000081). Encodes kernel and user CS/SS segment selectors for syscall/sysret.",
  IA32_FMASK:
    "Flag Mask Register (0xC0000084). Bits set here are cleared in RFLAGS on syscall (masks IF, TF, DF, AC).",
  ELR_EL1:
    "Exception Link Register (EL1). Hardware writes the return virtual PC here upon trapping to EL1 via svc.",
  ESR_EL1:
    "Exception Syndrome Register (EL1). Stores the hardware trap reason: EC=0x15 for SVC in AArch64.",
  SPSR_EL1:
    "Saved Process Status Register (EL1). Hardware saves previous PSTATE (NZCV, interrupts, lower EL) here.",
  VBAR_EL1:
    "Vector Base Address Register (EL1). Base address of the 16-entry exception vector table for EL1.",
  ELR_EL2:
    "Exception Link Register (EL2). Hardware stores return PC upon trapping to hypervisor via hvc.",
  ESR_EL2:
    "Exception Syndrome Register (EL2). Hardware records syndrome reason: EC=0x16 for HVC.",
  VBAR_EL2:
    "Vector Base Address Register (EL2). Base address of the EL2 hypervisor vector table.",
  ELR_EL3:
    "Exception Link Register (EL3). Hardware stores return PC upon entering Secure World via smc.",
  ESR_EL3:
    "Exception Syndrome Register (EL3). Hardware records syndrome reason: EC=0x17 for SMC in AArch64.",
  VBAR_EL3:
    "Vector Base Address Register (EL3). Base address of the ARM Trusted Firmware (EL3) vector table.",
  sepc: "Supervisor Exception PC. In RISC-V, stores the virtual address of the ecall instruction itself.",
  scause:
    "Supervisor Cause Register. Holds exception code 8 (Environment call from U-mode).",
  stvec:
    "Supervisor Trap Vector Base Register. Base address of the supervisor exception handler.",
  sstatus:
    "Supervisor Status Register. Hardware preserves SPP (previous mode) and SPIE (previous interrupt state).",
  medeleg:
    "Machine Exception Delegation Register. Bit 8 delegates U-mode ecalls directly to S-mode without M-mode firmware intervention.",
  "Intel SEAM Status":
    "Cryptographic status code returned in RAX by the Intel SEAM firmware module.",
  "Intel SEAM Mode":
    "Indicates active Secure Arbitration Mode operation isolated by SEAMRR hardware range registers.",
  "Last Trapped Vector":
    "The hardware interrupt or trap vector number dispatched into the operating system.",
  "Kernel Stack ESP0":
    "TSS-referenced Ring 0 kernel stack pointer loaded by the CPU on privilege elevation.",
};

export default function SpecialRegistersView({
  specialRegisters,
  privilege,
}: SpecialRegistersProps) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            Hardware Control, MSRs & System Registers
          </h4>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Silicon model-specific registers, exception syndromes, and vector
            table pointers.
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
          {privilege}
        </span>
      </div>

      <div className="space-y-2 font-mono text-xs">
        {Object.entries(specialRegisters).map(([key, val]) => {
          const explanation = REGISTER_EXPLANATIONS[key];

          return (
            <div
              key={key}
              className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-zinc-700 dark:text-zinc-300 font-bold text-xs">
                  {key}
                </span>
                <span className="text-emerald-700 dark:text-emerald-300 text-[11px] font-bold font-mono">
                  {typeof val === "bigint" ? `0x${val.toString(16)}` : val}
                </span>
              </div>

              {explanation && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans leading-relaxed">
                  {explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
