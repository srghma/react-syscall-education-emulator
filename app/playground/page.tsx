import EmulatorDebugger from "@/components/EmulatorDebugger";

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Interactive Architecture Playground
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Switch between CPU architectures, edit assembly code in real time,
          step through instructions, and inspect registers and hardware
          micro-steps.
        </p>
      </div>

      <EmulatorDebugger initialInstructionId="syscall" />
    </div>
  );
}
