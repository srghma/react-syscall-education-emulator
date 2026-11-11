import type { InstructionSpec } from "@/types/emulator";
import { parseAssembly, type Program } from "@/lib/lean/assembler";

export const INSTRUCTIONS_DATA: InstructionSpec[] = [
  // 1. 1978 / 1985: Early x86 Software Interrupt Gates
  {
    id: "int-0x80",
    mnemonic: "int 0x80",
    fullName: "Software Interrupt Vector 0x80",
    arch: "x86_32",
    archDisplay: "x86 (32-bit / IA-32)",
    yearIntroduced: 1978,
    yearSiliconShipped: 1985,
    era: "Intel 80386 Protected Mode / Classic Linux",
    assemblerType: "GNU Assembler (.intel_syntax noprefix)",
    sourcePrivilege: "Ring 3 (User)",
    targetPrivilege: "Ring 0 (Kernel)",
    hardwareMechanism:
      "Interrupt Descriptor Table (IDT gate 0x80) via TSS.ESP0 kernel stack",
    returnInstruction: "iret",
    keyRegisters: [
      "EAX (syscall nr)",
      "EBX, ECX, EDX, ESI, EDI (args)",
      "ESP, SS",
    ],
    summary:
      "Legacy 32-bit Linux syscall interface. Traps through IDT gate 0x80, switches to the TSS Ring 0 stack, and pushes SS, ESP, EFLAGS, CS, and return EIP.",
    docsReference: "Intel SDM Vol 3A, Section 6.12",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Gate Lookup",
        hardwareAction: "Reads gate descriptor at IDTR.base + 0x80 * 8.",
        affectedComponents: ["IDTR", "IDT[0x80]"],
      },
      {
        stepNumber: 2,
        description: "Stack Switch",
        hardwareAction: "Loads Ring 0 ESP and SS from TSS.ESP0.",
        affectedComponents: ["TSS.ESP0", "SS", "ESP"],
      },
      {
        stepNumber: 3,
        description: "Context Push",
        hardwareAction:
          "Pushes SS, ESP, EFLAGS, CS, and return EIP onto Ring 0 stack.",
        affectedComponents: ["Ring 0 Stack"],
      },
      {
        stepNumber: 4,
        description: "Privilege Elevation",
        hardwareAction: "Switches CPL to 0; clears IF in EFLAGS.",
        affectedComponents: ["CS.DPL", "EFLAGS.IF"],
      },
    ],
    defaultProgram: `# 32-bit Linux System Call with Real String Buffer
.intel_syntax noprefix
.section .data
msg:
    .asciz "Hello from 32-bit Linux int 0x80!\\n"
    len = . - msg

.section .text
.global _start

_start:
    # sys_write(fd: 1, buf: msg, count: len)
    mov eax, 4          # sys_write (4)
    mov ebx, 1          # stdout (1)
    mov ecx, msg        # pointer to buffer in memory
    mov edx, len        # byte count
    int 0x80            # Hardware interrupt -> pushes SS, ESP, EFLAGS, CS, EIP to ESP0

    # sys_exit(0)
    mov eax, 1          # sys_exit (1)
    xor ebx, ebx        # status: 0
    int 0x80
`,
  },

  // 2. 1997: Intel Fast System Call MSRs
  {
    id: "sysenter",
    mnemonic: "sysenter",
    fullName: "Fast System Call",
    arch: "x86_32",
    archDisplay: "x86 (Pentium II Fastpath)",
    yearIntroduced: 1997,
    yearSiliconShipped: 1997,
    era: "Intel P6 / Pentium II Era",
    assemblerType: "GNU Assembler (.intel_syntax noprefix)",
    sourcePrivilege: "Ring 3 (User)",
    targetPrivilege: "Ring 0 (Kernel)",
    hardwareMechanism:
      "Model-Specific Registers (IA32_SYSENTER_CS, IA32_SYSENTER_ESP, IA32_SYSENTER_EIP)",
    returnInstruction: "sysexit",
    keyRegisters: [
      "EAX (syscall nr)",
      "ECX (user ESP)",
      "EDX (return EIP)",
      "MSR 0x174..0x176",
    ],
    summary:
      "Bypasses IDT lookups by jumping directly to cached kernel entry MSRs. Userland stages return EIP in EDX and user ESP in ECX for sysexit.",
    docsReference: "Intel SDM Vol 2B: SYSENTER",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Verify MSRs",
        hardwareAction: "Checks IA32_SYSENTER_CS (0x174) is non-zero.",
        affectedComponents: ["MSR 0x174"],
      },
      {
        stepNumber: 2,
        description: "Switch CS/SS",
        hardwareAction:
          "CS = MSR 0x174, SS = MSR 0x174 + 8, CPL switches to 0.",
        affectedComponents: ["CS", "SS", "CPL"],
      },
      {
        stepNumber: 3,
        description: "Load Stack & IP",
        hardwareAction: "ESP = MSR 0x175, EIP = MSR 0x176, clears IF.",
        affectedComponents: ["ESP", "EIP", "EFLAGS"],
      },
    ],
    defaultProgram: `# sysenter: Intel PII Fast System Call with Real String Buffer
.intel_syntax noprefix
.section .data
msg:
    .asciz "Hello from sysenter fastpath!\\n"
    len = . - msg

.section .text
.global _start

_start:
    # sys_write(fd: 1, buf: msg, count: len)
    mov eax, 4          # sys_write
    mov ebx, 1          # stdout
    mov ecx, msg        # buffer pointer
    mov edx, len        # byte count
    sysenter            # Direct jump to kernel via MSRs 0x174..0x176

    # sys_exit(0)
    mov eax, 1          # sys_exit
    xor ebx, ebx        # status: 0
    sysenter
`,
  },

  // 3. 1999 / 2003: AMD64 Long Mode Standard
  {
    id: "syscall",
    mnemonic: "syscall",
    fullName: "Native 64-bit Fast System Call",
    arch: "x86_64",
    archDisplay: "x86_64 (AMD64 / Intel 64)",
    yearIntroduced: 1999,
    yearSiliconShipped: 2003,
    era: "AMD64 / Long Mode Standard",
    assemblerType: "GNU Assembler (.intel_syntax noprefix)",
    sourcePrivilege: "Ring 3 (User)",
    targetPrivilege: "Ring 0 (Kernel)",
    hardwareMechanism:
      "MSRs: IA32_LSTAR (entry RIP), IA32_STAR (selectors), IA32_FMASK (RFLAGS mask)",
    returnInstruction: "sysretq",
    keyRegisters: [
      "RAX (nr)",
      "RDI, RSI, RDX, R10, R8, R9 (args)",
      "RCX (saved RIP)",
      "R11 (saved RFLAGS)",
    ],
    summary:
      "The definitive high-speed 64-bit system call instruction. Copies next RIP directly into RCX and RFLAGS into R11, masks flags via IA32_FMASK, and jumps to IA32_LSTAR.",
    docsReference:
      "AMD64 Architecture Programmer's Manual Vol 3, Section 3.1.1",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Context",
        hardwareAction: "RCX <= next RIP; R11 <= RFLAGS.",
        affectedComponents: ["RCX", "R11"],
      },
      {
        stepNumber: 2,
        description: "Mask Flags",
        hardwareAction: "RFLAGS &= ~(IA32_FMASK) (clears IF, TF, DF, AC).",
        affectedComponents: ["RFLAGS", "IA32_FMASK"],
      },
      {
        stepNumber: 3,
        description: "Switch CPL",
        hardwareAction: "Loads CS and SS from IA32_STAR; CPL <= 0.",
        affectedComponents: ["CS", "SS", "CPL"],
      },
      {
        stepNumber: 4,
        description: "Vector Leap",
        hardwareAction: "RIP <= IA32_LSTAR (0xffffffff81e00000).",
        affectedComponents: ["RIP", "IA32_LSTAR"],
      },
    ],
    defaultProgram: `# 64-bit Linux System Call with Real String Buffer
.intel_syntax noprefix
.section .data
msg:
    .asciz "Hello from 64-bit Linux kernel!\\n"
    len = . - msg

.section .text
.global _start

_start:
    # sys_write(fd: 1, buf: msg, count: len)
    mov rax, 1          # sys_write (Linux x86_64 = 1)
    mov rdi, 1          # stdout (1)
    lea rsi, msg        # pointer to string buffer
    mov rdx, len        # length in bytes
    syscall             # RCX <= RIP, R11 <= RFLAGS, RIP <= LSTAR

    # sys_exit(0)
    mov rax, 60         # sys_exit (Linux x86_64 = 60)
    xor rdi, rdi        # status = 0
    syscall
`,
  },

  // 4. 2004 / 2005: ARM TrustZone Security Boundary
  {
    id: "smc",
    mnemonic: "smc #0",
    fullName: "Secure Monitor Call",
    arch: "arm64",
    archDisplay: "ARMv8-A TrustZone",
    yearIntroduced: 2004,
    yearSiliconShipped: 2005,
    era: "ARM TrustZone Security Architecture",
    assemblerType: "GNU Assembler AArch64",
    sourcePrivilege: "EL1 (Kernel)",
    targetPrivilege: "EL3 (Secure Monitor / Firmware)",
    hardwareMechanism:
      "Trap to EL3; switches to Secure World; ESR_EL3 = 0x5e000000 (EC=0x17)",
    returnInstruction: "eret",
    keyRegisters: [
      "X0 (SMCCC Function ID)",
      "X1-X6 (parameters)",
      "ELR_EL3",
      "ESR_EL3",
    ],
    summary:
      "Traps from the Non-Secure OS into EL3 Secure Monitor / ARM Trusted Firmware (ATF).",
    docsReference: "ARM DEN 0028C (SMCCC Specification)",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Context",
        hardwareAction: "ELR_EL3 <= next PC; SPSR_EL3 <= PSTATE.",
        affectedComponents: ["ELR_EL3", "SPSR_EL3"],
      },
      {
        stepNumber: 2,
        description: "Record Syndrome",
        hardwareAction: "ESR_EL3 <= 0x5e000000 (EC=0x17 SMC, IL=1).",
        affectedComponents: ["ESR_EL3"],
      },
      {
        stepNumber: 3,
        description: "World Transition",
        hardwareAction: "SCR_EL3 updates; CPU switches to Secure World at EL3.",
        affectedComponents: ["SCR_EL3", "PSTATE.EL"],
      },
    ],
    defaultProgram: `// smc: ARM TrustZone Monitor Call (EL1 -> EL3)
.global _start

_start:
    mov x0, 0x80000000  // SMCCC_VERSION query (Arm Architecture Range)
    smc #0              // Trap to EL3 / ATF

    mov x8, 93
    mov x0, 0
    svc #0
`,
  },

  // 5. 2011 / 2013: ARMv8-A 64-bit OS Traps (EL0 -> EL1)
  {
    id: "svc",
    mnemonic: "svc #0",
    fullName: "Supervisor Call",
    arch: "arm64",
    archDisplay: "ARMv8-A / ARMv9-A (AArch64)",
    yearIntroduced: 2011,
    yearSiliconShipped: 2013,
    era: "ARMv8-A 64-bit Architecture",
    assemblerType: "GNU Assembler (.syntax unified)",
    sourcePrivilege: "EL0 (User)",
    targetPrivilege: "EL1 (Kernel)",
    hardwareMechanism:
      "Synchronous Exception to EL1; saves PC into ELR_EL1, PSTATE into SPSR_EL1, updates ESR_EL1",
    returnInstruction: "eret",
    keyRegisters: [
      "X8 (nr)",
      "X0-X5 (args)",
      "ELR_EL1 (return PC)",
      "ESR_EL1 (syndrome)",
    ],
    summary:
      "Triggers a synchronous exception from EL0 to EL1. Populates ESR_EL1 with EC=0x15 (SVC) and IL=1 (0x56000000).",
    docsReference: "ARM Architecture Reference Manual ARMv8 (DDI 0487)",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Context",
        hardwareAction: "ELR_EL1 <= next PC; SPSR_EL1 <= PSTATE.",
        affectedComponents: ["ELR_EL1", "SPSR_EL1"],
      },
      {
        stepNumber: 2,
        description: "Record Syndrome",
        hardwareAction: "ESR_EL1 <= 0x56000000 (EC=0x15 SVC, IL=1, ISS=0).",
        affectedComponents: ["ESR_EL1"],
      },
      {
        stepNumber: 3,
        description: "Elevation",
        hardwareAction: "Current Exception Level becomes EL1; selects SP_EL1.",
        affectedComponents: ["PSTATE.EL", "SP"],
      },
      {
        stepNumber: 4,
        description: "Branch",
        hardwareAction: "Branches to VBAR_EL1 + 0x400.",
        affectedComponents: ["PC", "VBAR_EL1"],
      },
    ],
    defaultProgram: `// ARM64 Linux System Call with Real String Buffer
.section .data
msg:
    .asciz "Hello from ARM64 AArch64 Linux!\\n"
    len = . - msg

.section .text
.global _start

_start:
    // sys_write(fd: 1, buf: msg, count: len)
    mov x8, 64          // sys_write (ARM64 Linux = 64)
    mov x0, 1           // fd = 1 (stdout)
    adr x1, msg         // load address of string into x1
    mov x2, len         // length from symbol
    svc #0              // Transition EL0 -> EL1; ESR_EL1.EC = 0x15

    // sys_exit(0)
    mov x8, 93          // sys_exit (ARM64 Linux = 93)
    mov x0, 0           // exit status = 0
    svc #0
`,
  },

  // 6. 2011 / 2013: ARMv8-A Hardware Virtualization Traps (EL1 -> EL2)
  {
    id: "hvc",
    mnemonic: "hvc #0",
    fullName: "Hypervisor Call",
    arch: "arm64",
    archDisplay: "ARMv8-A Virtualization",
    yearIntroduced: 2011,
    yearSiliconShipped: 2013,
    era: "ARMv8 EL2 Hypervisor Extension",
    assemblerType: "GNU Assembler AArch64",
    sourcePrivilege: "EL1 (Kernel)",
    targetPrivilege: "EL2 (Hypervisor)",
    hardwareMechanism:
      "Trap to EL2; saves PC to ELR_EL2, PSTATE to SPSR_EL2, ESR_EL2 = 0x5a000000 (EC=0x16)",
    returnInstruction: "eret",
    keyRegisters: [
      "X0 (PSCI Function ID)",
      "X1-X3 (args)",
      "ELR_EL2",
      "ESR_EL2",
    ],
    summary:
      "Enables guest kernels at EL1 to invoke EL2 hypervisor services such as CPU power control (PSCI).",
    docsReference: "ARM DEN 0022D (PSCI Specification)",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Context",
        hardwareAction: "ELR_EL2 <= next PC; SPSR_EL2 <= PSTATE.",
        affectedComponents: ["ELR_EL2", "SPSR_EL2"],
      },
      {
        stepNumber: 2,
        description: "Record Syndrome",
        hardwareAction: "ESR_EL2 <= 0x5a000000 (EC=0x16 HVC, IL=1).",
        affectedComponents: ["ESR_EL2"],
      },
      {
        stepNumber: 3,
        description: "Elevate EL",
        hardwareAction: "PSTATE.EL switches to EL2; selects SP_EL2.",
        affectedComponents: ["PSTATE.EL", "SP_EL2"],
      },
    ],
    defaultProgram: `// hvc: Hypervisor Call (EL1 -> EL2)
.global _start

_start:
    mov x0, 0x84000003  // PSCI_0_2_FN_CPU_ON Function ID
    mov x1, 1           // Core ID = 1
    mov x2, 0x80080000  // Core entry point
    hvc #0              // Trap to Hypervisor (EL2)

    mov x8, 93
    svc #0
`,
  },

  // 7. 2014 / 2018: RISC-V Unified Environment Call
  {
    id: "ecall",
    mnemonic: "ecall",
    fullName: "Environment Call",
    arch: "riscv",
    archDisplay: "RISC-V (RV32 / RV64)",
    yearIntroduced: 2014,
    yearSiliconShipped: 2018,
    era: "RISC-V Privileged Architecture",
    assemblerType: "GNU Assembler (riscv64-unknown-elf-as)",
    sourcePrivilege: "U-Mode (User)",
    targetPrivilege: "S-Mode (Supervisor)",
    hardwareMechanism:
      "Hardware stores the ecall address itself into sepc, writes scause=8, jumps to stvec",
    returnInstruction: "sret / mret",
    keyRegisters: [
      "a7 (nr)",
      "a0-a5 (args)",
      "sepc (holds ecall PC)",
      "scause (cause code 8)",
    ],
    summary:
      "The unified RISC-V environment call. Trapping from U-mode writes the address of ecall itself into sepc and delegates to S-Mode.",
    docsReference:
      "The RISC-V Instruction Set Manual, Vol II: Privileged Architecture",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Return PC",
        hardwareAction: "sepc <= address of ecall instruction itself.",
        affectedComponents: ["sepc"],
      },
      {
        stepNumber: 2,
        description: "Set Cause",
        hardwareAction: "scause <= 8 (Environment call from U-mode).",
        affectedComponents: ["scause"],
      },
      {
        stepNumber: 3,
        description: "Privilege Shift",
        hardwareAction: "sstatus.SPP <= U-Mode, sstatus.SPIE <= SIE, SIE <= 0.",
        affectedComponents: ["sstatus"],
      },
      {
        stepNumber: 4,
        description: "Vector Leap",
        hardwareAction: "PC <= stvec (Supervisor Trap Vector).",
        affectedComponents: ["PC", "stvec"],
      },
    ],
    defaultProgram: `# RISC-V 64-bit System Call with Real String Buffer
.section .data
msg:
    .asciz "Hello from RISC-V RV64GC kernel!\\n"
    len = . - msg

.section .text
.globl _start

_start:
    # sys_write(fd: 1, buf: msg, count: len)
    li a7, 64           # Linux sys_write (64)
    li a0, 1            # fd = 1 (stdout)
    la a1, msg          # load address of message
    li a2, len          # length from equate symbol
    ecall               # Trap to S-mode (scause = 8, sepc = PC)

    # sys_exit(0)
    li a7, 93           # Linux sys_exit (93)
    li a0, 0            # status = 0
    ecall
`,
  },

  // 8. 2020 / 2023: Intel TDX Confidential VM Call (Guest -> SEAM)
  {
    id: "tdcall",
    mnemonic: "tdcall",
    fullName: "Trust Domain Call",
    arch: "x86_64",
    archDisplay: "Intel TDX (Trust Domain Extensions)",
    yearIntroduced: 2020,
    yearSiliconShipped: 2023,
    era: "Intel 4th Gen Xeon (Sapphire Rapids)",
    assemblerType: "GNU Assembler (.intel_syntax noprefix)",
    sourcePrivilege: "TD Guest (VMX Non-Root Encrypted)",
    targetPrivilege: "Intel SEAM (Secure Arbitration Mode)",
    hardwareMechanism:
      "Transitions to authenticated Intel SEAM module; scrubs unshared registers before signaling host VMM",
    returnInstruction: "SEAMRET",
    keyRegisters: [
      "RAX (Leaf 0: TDG.VP.VMCALL)",
      "RCX (GPR sharing bitmask)",
      "R11 (sub-function)",
    ],
    summary:
      "Executed inside a confidential VM. Leaves unshared registers sanitized before signaling the untrusted host VMM.",
    docsReference: "Intel TDX Module Architecture Specification",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "SEAM Check",
        hardwareAction:
          "Verifies CPU SEAM mode is configured and SEAMRR is locked.",
        affectedComponents: ["SEAMRR"],
      },
      {
        stepNumber: 2,
        description: "Trap to SEAM",
        hardwareAction:
          "Transfers execution from Non-Root guest into Intel SEAM.",
        affectedComponents: ["SEAM Module", "RIP"],
      },
      {
        stepNumber: 3,
        description: "Scrub Secrets",
        hardwareAction:
          "Zeroes non-shared GPRs to prevent host hypervisor leakage.",
        affectedComponents: ["RBX", "RSI", "RDI", "R12..R15"],
      },
    ],
    defaultProgram: `# tdcall: Intel TDX Confidential VM Call
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov rax, 0          # Leaf 0: TDG.VP.VMCALL
    mov rcx, 0x0C00     # Expose only R10 and R11
    mov r11, 1          # Sub-function 1: Print/Logging
    mov r12, 0x1000     # Shared parameter buffer
    tdcall              # Trap to SEAM; sanitize guest state

    mov rax, 60
    xor rdi, rdi
    syscall
`,
  },

  // 9. 2020 / 2023: Intel TDX Hypervisor Call (Host -> SEAM)
  {
    id: "seamcall",
    mnemonic: "seamcall",
    fullName: "Secure Arbitration Mode Call",
    arch: "x86_64",
    archDisplay: "Intel TDX Host VMM",
    yearIntroduced: 2020,
    yearSiliconShipped: 2023,
    era: "Intel 4th Gen Xeon (Sapphire Rapids)",
    assemblerType: "GNU Assembler (.intel_syntax noprefix)",
    sourcePrivilege: "Host VMM (Root Ring 0)",
    targetPrivilege: "Intel SEAM (Secure Arbitration Mode)",
    hardwareMechanism:
      "Root VMX invocation of Intel SEAM module; enforces Secure EPT and KeyID allocation",
    returnInstruction: "SEAMRET",
    keyRegisters: [
      "RAX (Leaf 21: TDH.MNG.INIT)",
      "RCX (TDR page address)",
      "RDX (KeyID)",
    ],
    summary:
      "Executed by the host hypervisor in VMX root operation to manage trust domains.",
    docsReference: "Intel TDX Module Base Architecture: SEAMCALL",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Verify Root Mode",
        hardwareAction:
          "CPU ensures CPL == 0 and CR4.VMXE == 1 in root operation.",
        affectedComponents: ["CR4.VMXE", "CPL"],
      },
      {
        stepNumber: 2,
        description: "Enter SEAM",
        hardwareAction: "Switches to Secure Arbitration Mode.",
        affectedComponents: ["SEAM Mode", "RIP"],
      },
    ],
    defaultProgram: `# seamcall: Host VMM Managing TDX Container
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov rax, 21         # Leaf 21 (0x15): TDH.MNG.INIT
    mov rcx, 0x7A000000 # TDR physical page address
    mov rdx, 7          # Assigned Hardware KeyID
    seamcall            # Enter SEAM; verify hardware crypto configuration

    mov rax, 60         # sys_exit
    xor rdi, rdi        # status = 0
    syscall
`,
  },
];

export function getInstructionById(id: string): InstructionSpec | undefined {
  return INSTRUCTIONS_DATA.find((item) => item.id === id);
}

export const CODE_EXAMPLES: Record<string, string> = Object.fromEntries(
  INSTRUCTIONS_DATA.map((item) => [item.id, item.defaultProgram]),
);

/**
 * Pre-parse and validate all 9 default assembly programs at module load time.
 */
export const PREPARSED_PROGRAMS: Record<string, Program> = {};

for (const item of INSTRUCTIONS_DATA) {
  const result = parseAssembly(item.defaultProgram, item.arch);
  if (result.tag === "error") {
    throw new Error(
      `[Startup Validation Failed] Error parsing default program for '${item.id}': ${result.error}`,
    );
  }
  PREPARSED_PROGRAMS[item.id] = result.value;
}
