export default function ArchitectureDiagram() {
  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
        Hardware Privilege Hierarchies & Trap Vector Routing
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        How hardware instructions navigate CPU security layers across legacy,
        modern 64-bit, and confidential computing tiers.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        {/* x86-32 / x86-64 */}
        <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs mb-2">
            x86 Rings (Hierarchical)
          </div>
          <div className="space-y-2">
            <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
              <div className="font-bold">Ring 3 (User Space)</div>
              <div className="text-[10px]">Unprivileged processes</div>
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; int 0x80 / sysenter / syscall
            </div>
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <div className="font-bold">Ring 0 (Supervisor)</div>
              <div className="text-[10px]">OS Kernel / Device drivers</div>
            </div>
          </div>
        </div>

        {/* ARM64 Exception Levels */}
        <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs mb-2">
            ARM64 Exception Levels
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
              <span className="font-bold">EL0</span>: User Application
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
              &darr; svc #0
            </div>
            <div className="p-1.5 rounded bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400">
              <span className="font-bold">EL1</span>: OS Kernel (Linux)
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
              &darr; hvc #0
            </div>
            <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <span className="font-bold">EL2</span>: Hypervisor (KVM)
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
              &darr; smc #0
            </div>
            <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
              <span className="font-bold">EL3</span>: Secure Monitor / TrustZone
            </div>
          </div>
        </div>

        {/* RISC-V Privileged Modes */}
        <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs mb-2">
            RISC-V Modes (Unified)
          </div>
          <div className="space-y-2">
            <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
              <div className="font-bold">U-Mode</div>
              <div className="text-[10px]">User space</div>
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; ecall (scause = 8)
            </div>
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <div className="font-bold">S-Mode</div>
              <div className="text-[10px]">Supervisor Kernel (Linux)</div>
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; ecall (mcause = 9 / OpenSBI)
            </div>
            <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400">
              <div className="font-bold">M-Mode</div>
              <div className="text-[10px]">Machine Firmware (M-Mode)</div>
            </div>
          </div>
        </div>

        {/* Confidential Computing (Intel TDX) */}
        <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="font-sans font-semibold text-zinc-900 dark:text-zinc-100 text-xs mb-2">
            Intel TDX (Confidential)
          </div>
          <div className="space-y-2">
            <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <div className="font-bold">TD Guest VM</div>
              <div className="text-[10px]">Hardware-encrypted VM</div>
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &darr; tdcall
            </div>
            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <div className="font-bold">Intel SEAM Module</div>
              <div className="text-[10px]">Cryptographic Trust Broker</div>
            </div>
            <div className="text-center font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              &uarr; seamcall
            </div>
            <div className="p-2 rounded bg-zinc-500/10 border border-zinc-500/20 text-zinc-600 dark:text-zinc-400">
              <div className="font-bold">Host Hypervisor</div>
              <div className="text-[10px]">Untrusted KVM/Hyper-V</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
