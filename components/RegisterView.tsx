import type { Arch } from "@/lib/lean/domain";

interface RegisterViewProps {
  registers: Record<string, bigint>;
  previousRegisters?: Record<string, bigint>;
  arch: Arch;
}

const REGISTER_ROLES: Record<Arch, Record<string, string>> = {
  x86_64: {
    rax: "Syscall NR / Return",
    rdi: "1st Arg (fd / exit)",
    rsi: "2nd Arg (buf ptr)",
    rdx: "3rd Arg (count)",
    r10: "4th Arg (replaces RCX)",
    r8: "5th Argument",
    r9: "6th Argument",
    rcx: "Hardware Return RIP",
    r11: "Hardware Return RFLAGS",
    rsp: "Stack Pointer",
    rbp: "Frame Pointer",
    rbx: "Callee-saved",
    r12: "Callee-saved",
    r13: "Callee-saved",
    r14: "Callee-saved",
    r15: "Callee-saved",
  },
  x86_32: {
    eax: "Syscall NR / Return",
    ebx: "1st Arg (fd / exit)",
    ecx: "2nd Arg (buf ptr)",
    edx: "3rd Arg (count)",
    esi: "4th Argument",
    edi: "5th Argument",
    ebp: "Frame Pointer",
    esp: "Stack Pointer",
  },
  arm64: {
    x8: "Syscall NR (Linux)",
    x0: "1st Arg / FID / Return",
    x1: "2nd Arg (buf ptr)",
    x2: "3rd Arg (count)",
    x3: "4th Argument",
    x4: "5th Argument",
    x5: "6th Argument",
    x6: "7th Argument",
    x7: "8th Argument",
    sp: "Stack Pointer",
    xzr: "Hardwired Zero",
    x29: "Frame Pointer",
    x30: "Link Register",
  },
  riscv: {
    a7: "Syscall NR (Linux)",
    a0: "1st Arg / Return",
    a1: "2nd Arg (buf ptr)",
    a2: "3rd Arg (count)",
    a3: "4th Argument",
    a4: "5th Argument",
    a5: "6th Argument",
    zero: "Hardwired Zero",
    ra: "Return Address",
    sp: "Stack Pointer",
    gp: "Global Pointer",
    tp: "Thread Pointer",
    s0: "Frame Pointer",
  },
};

export default function RegisterView({
  registers,
  previousRegisters,
  arch,
}: RegisterViewProps) {
  const entries = Object.entries(registers);
  const roles = REGISTER_ROLES[arch] ?? {};

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            General Purpose Registers
          </h4>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Green outlines indicate registers modified on the last step.
          </p>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">
          {entries.length} Registers
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 font-mono text-xs">
        {entries.map(([reg, val]) => {
          const prevVal = previousRegisters?.[reg];
          const hasMutated = prevVal !== undefined && prevVal !== val;
          const isNonZero = val !== 0n;
          const role = roles[reg.toLowerCase()];

          return (
            <div
              key={reg}
              className={`p-2 rounded-lg border transition-all ${
                hasMutated
                  ? "bg-emerald-500/10 border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
                  : isNonZero
                    ? "bg-zinc-100 dark:bg-zinc-800/80 border-zinc-300 dark:border-zinc-700"
                    : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              }`}
              title={
                hasMutated
                  ? `Mutated: 0x${prevVal.toString(16)} -> 0x${val.toString(16)}`
                  : undefined
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-zinc-700 dark:text-zinc-200">
                  {reg}
                </span>
                {hasMutated && (
                  <span className="text-[9px] px-1 rounded bg-emerald-500 text-white font-sans font-bold">
                    DIFF
                  </span>
                )}
              </div>

              {role && (
                <div
                  className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 truncate mt-0.5"
                  title={role}
                >
                  {role}
                </div>
              )}

              <div
                className={`font-semibold truncate text-[11px] mt-1.5 ${
                  hasMutated
                    ? "text-emerald-600 dark:text-emerald-400 font-bold"
                    : isNonZero
                      ? "text-zinc-900 dark:text-zinc-100 font-medium"
                      : "text-zinc-400 dark:text-zinc-600 font-normal"
                }`}
                title={`0x${val.toString(16)} (${val.toString()})`}
              >
                0x{val.toString(16)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
