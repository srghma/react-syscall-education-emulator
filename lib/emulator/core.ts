/**
 * @deprecated Legacy emulator core - superseded by the Lean formal state machine in @/lib/lean/
 */
export { stepMachine as stepEmulator } from "@/lib/lean/evaluator";
export { createInitialMachine as createInitialState } from "@/lib/lean/factory";
export type { MachineState } from "@/lib/lean/state";
export { parseAssembly } from "@/lib/lean/assembler";
