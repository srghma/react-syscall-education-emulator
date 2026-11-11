import type { Arch } from "@/lib/lean/domain";

interface RegisterViewProps {
  registers: Record<string, bigint>;
  arch: Arch;
}

const REGISTER_ROLES: Record<Arch, Record<string, string>> = {
  x86_64: {
    rax: "Syscall NR / Return Value",
    rdi: "1st Argument (fd / status)",
    rsi: "2nd Argument (buf pointer)",
    rdx: "3rd Argument (byte count)",
    r10: "4th Argument (replaces RCX)",
    r8: "5th Argument",
    r9: "6th Argument",
    rcx: "Hardware Return RIP (syscall)",
    r11: "Hardware Return RFLAGS",
    rsp: "User Stack Pointer",
    rbp: "Frame Pointer / Callee-saved",
    rbx: "Callee-saved GPR",
    r12: "Callee-saved GPR",
    r13: "Callee-saved GPR",
    r14: "Callee-saved GPR",
    r15: "Callee-saved GPR",
  },
  x86_32: {
    eax: "Syscall NR / Return Value",
    ebx: "1st Argument (fd / exit code)",
    ecx: "2nd Argument (buf / user ESP)",
    edx: "3rd Argument (count / ret EIP)",
    esi: "4th Argument",
    edi: "5th Argument",
    ebp: "6th Argument / Frame Pointer",
    esp: "User Stack Pointer",
  },
  arm64: {
    x8: "Syscall Number (AArch64 Linux)",
    x0: "1st Arg (fd) / PSCI FID / Return",
    x1: "2nd Arg (buf pointer)",
    x2: "3rd Arg (byte count)",
    x3: "4th Argument",
    x4: "5th Argument",
    x5: "6th Argument",
    x6: "7th Argument",
    x7: "8th Argument",
    sp: "Stack Pointer (SP_EL0)",
    xzr: "Hardwired Zero Register",
    x29: "Frame Pointer (FP)",
    x30: "Link Register (LR)",
  },
  riscv: {
    a7: "Syscall Number (Linux RV64)",
    a0: "1st Arg (fd) / Return Value",
    a1: "2nd Arg (buf pointer)",
    a2: "3rd Arg (byte count)",
    a3: "4th Argument",
    a4: "5th Argument",
    a5: "6th Argument",
    zero: "Hardwired Zero (x0)",
    ra: "Return Address (x1)",
    sp: "Stack Pointer (x2)",
    gp: "Global Pointer (x3)",
    tp: "Thread Pointer (x4)",
    s0: "Frame Pointer / Saved (x8)",
  },
};

export default function RegisterView({ registers, arch }: RegisterViewProps) {
  const entries = Object.entries(registers);
  const roles = REGISTER_ROLES[arch] ?? {};

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            General Purpose Registers & ABI Staging
          </h4>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Architecture-specific register assignments for arguments, numbers,
            and pointers.
          </p>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">
          {entries.length} Registers
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 font-mono text-xs">
        {entries.map(([reg, val]) => {
          const isNonZero = val !== 0n;
          const role = roles[reg.toLowerCase()];

          return (
            <div
              key={reg}
              className={`p-2 rounded-lg border transition-colors flex flex-col justify-between ${
                isNonZero
                  ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60"
                  : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-zinc-700 dark:text-zinc-200">
                    {reg}
                  </span>
                  {role && (
                    <span
                      className="text-[9px] font-sans truncate max-w-[90px] text-zinc-400 dark:text-zinc-500 font-medium"
                      title={role}
                    >
                      {role}
                    </span>
                  )}
                </div>

                {role && (
                  <div
                    className="text-[10px] font-sans text-emerald-700 dark:text-emerald-400 truncate mt-0.5 font-medium"
                    title={role}
                  >
                    {role}
                  </div>
                )}
              </div>

              <div
                className={`font-semibold truncate text-[11px] mt-1.5 ${
                  isNonZero
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-zinc-800 dark:text-zinc-300"
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
