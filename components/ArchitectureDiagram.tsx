interface ArchitectureDiagramProps {
  activeId?: string;
}

export default function ArchitectureDiagram({
  activeId,
}: ArchitectureDiagramProps) {
  const isX86Trap = ["int-0x80", "sysenter", "syscall"].includes(
    activeId ?? "",
  );
  const isArmTrap = ["svc", "hvc", "smc"].includes(activeId ?? "");
  const isRiscVTrap = activeId === "ecall";
  const isTdxTrap = ["tdcall", "seamcall"].includes(activeId ?? "");

  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Hardware Privilege Hierarchies & Trap Vector Routing
        </h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          How hardware instructions navigate CPU security layers across legacy,
          modern 64-bit, and confidential computing tiers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        {/* x86 Rings */}
        <div
          className={`flex flex-col justify-between border rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2 transition-all ${
            isX86Trap
              ? "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
              : "border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800">
            <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
              x86 Rings
            </span>
            {isX86Trap && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9px] font-sans font-bold">
                ACTIVE
              </span>
            )}
          </div>

          <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
            <div className="font-bold">Ring 3 (User Space)</div>
            <div className="text-[10px] text-zinc-500">
              Unprivileged user processes
            </div>
          </div>

          <div className="text-center space-y-0.5 py-1">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; int 0x80 / sysenter / syscall
            </div>
            <div className="text-indigo-600 dark:text-indigo-400 text-[10px]">
              &uarr; iret / sysexit / sysretq
            </div>
          </div>

          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
            <div className="font-bold">Ring 0 (Supervisor)</div>
            <div className="text-[10px] text-zinc-500">
              Kernel & TSS ESP0 stack
            </div>
          </div>
        </div>

        {/* ARM64 Exception Levels */}
        <div
          className={`flex flex-col justify-between border rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-1.5 text-[11px] transition-all ${
            isArmTrap
              ? "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
              : "border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800">
            <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
              ARM64 Exception Levels
            </span>
            {isArmTrap && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9px] font-sans font-bold">
                ACTIVE
              </span>
            )}
          </div>

          <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
            <span className="font-bold">EL0</span>: User Application
          </div>
          <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
            &darr; svc #0 &nbsp; | &nbsp; &uarr; eret
          </div>

          <div className="p-1.5 rounded bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-300">
            <span className="font-bold">EL1</span>: OS Kernel (Linux)
          </div>
          <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
            &darr; hvc #0 &nbsp; | &nbsp; &uarr; eret
          </div>

          <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
            <span className="font-bold">EL2</span>: Hypervisor (KVM)
          </div>
          <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
            &darr; smc #0 &nbsp; | &nbsp; &uarr; eret
          </div>

          <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
            <span className="font-bold">EL3</span>: Secure Monitor (ATF)
          </div>
        </div>

        {/* RISC-V Privileged Modes */}
        <div
          className={`flex flex-col justify-between border rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2 transition-all ${
            isRiscVTrap
              ? "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
              : "border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800">
            <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
              RISC-V Modes
            </span>
            {isRiscVTrap && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9px] font-sans font-bold">
                ACTIVE
              </span>
            )}
          </div>

          <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
            <div className="font-bold">U-Mode (User)</div>
            <div className="text-[10px] text-zinc-500">User space</div>
          </div>

          <div className="text-center space-y-0.5 py-1">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; ecall (scause = 8)
            </div>
            <div className="text-indigo-600 dark:text-indigo-400 text-[10px]">
              &uarr; sret (sepc + 4)
            </div>
          </div>

          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
            <div className="font-bold">S-Mode (Supervisor)</div>
            <div className="text-[10px] text-zinc-500">
              OS Kernel (via medeleg)
            </div>
          </div>

          <div className="text-center space-y-0.5 py-1">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; ecall (mcause = 9)
            </div>
            <div className="text-indigo-600 dark:text-indigo-400 text-[10px]">
              &uarr; mret
            </div>
          </div>

          <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
            <div className="font-bold">M-Mode (Machine)</div>
            <div className="text-[10px] text-zinc-500">OpenSBI firmware</div>
          </div>
        </div>

        {/* Intel TDX */}
        <div
          className={`flex flex-col justify-between border rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2 transition-all ${
            isTdxTrap
              ? "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
              : "border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800">
            <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
              Intel TDX (Confidential)
            </span>
            {isTdxTrap && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9px] font-sans font-bold">
                ACTIVE
              </span>
            )}
          </div>

          <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
            <div className="font-bold">TD Guest VM</div>
            <div className="text-[10px] text-zinc-500">
              Hardware-encrypted memory
            </div>
          </div>

          <div className="text-center space-y-0.5 py-1">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; tdcall (Leaf 0 VMCALL)
            </div>
            <div className="text-indigo-600 dark:text-indigo-400 text-[10px]">
              &uarr; SEAMRET
            </div>
          </div>

          <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
            <div className="font-bold">Intel SEAM Module</div>
            <div className="text-[10px] text-zinc-500">
              Cryptographic Broker (SEAMRR)
            </div>
          </div>

          <div className="text-center space-y-0.5 py-1">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &uarr; seamcall (Leaf 21 INIT)
            </div>
            <div className="text-indigo-600 dark:text-indigo-400 text-[10px]">
              &darr; SEAMRET
            </div>
          </div>

          <div className="p-2 rounded bg-zinc-500/10 border border-zinc-500/20 text-zinc-700 dark:text-zinc-300">
            <div className="font-bold">Host Hypervisor</div>
            <div className="text-[10px] text-zinc-500">
              Untrusted KVM/Hyper-V (Root 0)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
