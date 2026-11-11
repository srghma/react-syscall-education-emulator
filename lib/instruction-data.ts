import type { InstructionSpec } from "@/types/emulator";

export const INSTRUCTIONS_DATA: InstructionSpec[] = [
  {
    id: "int-0x80",
    mnemonic: "int 0x80",
    fullName: "Software Interrupt Vector 0x80",
    arch: "x86_32",
    archDisplay: "x86 (32-bit / IA-32)",
    yearIntroduced: 1985,
    yearSiliconShipped: 1985,
    era: "Intel 80386 / Early Unix/Linux Era",
    assemblerType: "GNU Assembler (.intel_syntax noprefix) / NASM",
    sourcePrivilege: "Ring 3 (User)",
    targetPrivilege: "Ring 0 (Kernel)",
    hardwareMechanism:
      "Interrupt Descriptor Table (IDT entry 128 / 0x80) via TSS ESP0 kernel stack",
    returnInstruction: "iret",
    keyRegisters: [
      "EAX (syscall nr)",
      "EBX, ECX, EDX, ESI, EDI (args)",
      "ESP, SS (saved on kernel stack)",
    ],
    summary:
      "The classic 32-bit Linux system call mechanism. Triggers a slow hardware trap looking up gate 0x80 in the IDT, pushes 5 user registers onto the TSS-referenced kernel stack, and switches from Ring 3 to Ring 0.",
    docsReference:
      "Intel 64 and IA-32 Architectures Software Developer's Manual, Vol 3A, Section 6.12",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Vector Lookup",
        hardwareAction:
          "Reads index 0x80 from the Interrupt Descriptor Table (IDTR.base + 0x80 * 8).",
        affectedComponents: ["IDTR", "IDT[0x80]"],
      },
      {
        stepNumber: 2,
        description: "Stack Switch",
        hardwareAction:
          "Reads Ring 0 ESP and SS from Task State Segment (TSS.ESP0) and switches hardware stack.",
        affectedComponents: ["SS", "ESP", "TSS"],
      },
      {
        stepNumber: 3,
        description: "Save User Context",
        hardwareAction:
          "Pushes old SS, old ESP, EFLAGS, old CS, and return EIP onto Ring 0 stack.",
        affectedComponents: ["Ring 0 Stack", "EFLAGS"],
      },
      {
        stepNumber: 4,
        description: "Privilege Transition",
        hardwareAction:
          "Sets CPL (Current Privilege Level) to 0 and clears IF (Interrupt Flag) in EFLAGS.",
        affectedComponents: ["CS.DPL", "EFLAGS.IF"],
      },
      {
        stepNumber: 5,
        description: "Kernel Branch",
        hardwareAction:
          "Loads EIP with the segment offset from the IDT gate entry point (system_call).",
        affectedComponents: ["EIP"],
      },
    ],
    defaultProgram: `# int 0x80: Classic 32-bit Linux Syscall
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov eax, 4          # sys_write (4)
    mov ebx, 1          # stdout (1)
    mov edx, 14         # length: 14 bytes
    int 0x80            # Trap to IDT gate 0x80 (Ring 3 -> Ring 0)

    mov eax, 1          # sys_exit (1)
    xor ebx, ebx        # exit code 0
    int 0x80            # Terminate process
`,
  },
  {
    id: "sysenter",
    mnemonic: "sysenter",
    fullName: "Fast System Call",
    arch: "x86_32",
    archDisplay: "x86 (32-bit Pentium Pro Fastpath)",
    yearIntroduced: 1995,
    yearSiliconShipped: 1997,
    era: "Intel P6 (Pentium Pro / Pentium II) Era",
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
      "Bypasses the high-overhead IDT lookup by jumping directly to MSR-cached addresses. Does not push return values to memory; user code must load user return EIP into EDX and user ESP into ECX.",
    docsReference: "Intel SDM Vol 2B: SYSENTER - Fast System Call",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Verify MSR Setup",
        hardwareAction: "Validates IA32_SYSENTER_CS (0x174) is non-zero.",
        affectedComponents: ["MSR 0x174"],
      },
      {
        stepNumber: 2,
        description: "Switch Code Segment",
        hardwareAction:
          "Sets CS = IA32_SYSENTER_CS, CPL = 0 (Ring 0 kernel mode).",
        affectedComponents: ["CS", "CPL"],
      },
      {
        stepNumber: 3,
        description: "Load Kernel Stack",
        hardwareAction:
          "Sets SS = IA32_SYSENTER_CS + 8, ESP = IA32_SYSENTER_ESP (0x175).",
        affectedComponents: ["SS", "ESP", "MSR 0x175"],
      },
      {
        stepNumber: 4,
        description: "Branch & Mask",
        hardwareAction:
          "Sets EIP = IA32_SYSENTER_EIP (0x176), clears VM and IF in EFLAGS.",
        affectedComponents: ["EIP", "EFLAGS"],
      },
    ],
    defaultProgram: `# sysenter: 32-bit Fast System Call
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov eax, 4          # sys_write (4)
    mov ebx, 1          # stdout (1)
    mov edx, 0x00401050 # pass return address in EDX
    mov ecx, esp        # pass user stack in ECX
    sysenter            # Fast hardware leap to kernel via MSRs

    mov eax, 1          # sys_exit (1)
    xor ebx, ebx        # status 0
    sysenter
`,
  },
  {
    id: "syscall",
    mnemonic: "syscall",
    fullName: "Native 64-bit Fast System Call",
    arch: "x86_64",
    archDisplay: "x86_64 (AMD64 / Intel 64)",
    yearIntroduced: 1999,
    yearSiliconShipped: 2003,
    era: "AMD K8 (Opteron/Athlon 64) Standard",
    assemblerType: "GNU Assembler (.intel_syntax noprefix) / NASM / GAS",
    sourcePrivilege: "Ring 3 (User)",
    targetPrivilege: "Ring 0 (Kernel)",
    hardwareMechanism:
      "MSRs: LSTAR (entry RIP), STAR (CS/SS selectors), FMASK (RFLAGS mask)",
    returnInstruction: "sysretq",
    keyRegisters: [
      "RAX (nr)",
      "RDI, RSI, RDX, R10, R8, R9 (args)",
      "RCX (saved RIP)",
      "R11 (saved RFLAGS)",
    ],
    summary:
      "The definitive high-speed system call on modern 64-bit x86. Stores user RIP directly into RCX and RFLAGS into R11, masks flags via IA32_FMASK, and jumps instantly to IA32_LSTAR.",
    docsReference:
      "AMD64 Architecture Programmer's Manual Vol 3, Section 3.1.1 SYSCALL",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save User IP & Flags",
        hardwareAction:
          "Copies next RIP into RCX and RFLAGS into R11 (zero-overhead hardware registers).",
        affectedComponents: ["RCX", "R11"],
      },
      {
        stepNumber: 2,
        description: "Mask Flags",
        hardwareAction:
          "RFLAGS &= ~(IA32_FMASK), clearing IF (Interrupt Flag) and RF.",
        affectedComponents: ["RFLAGS", "IA32_FMASK (0xC0000084)"],
      },
      {
        stepNumber: 3,
        description: "Switch Privileges",
        hardwareAction:
          "Loads CS and SS target selectors from IA32_STAR; switches CPL to 0.",
        affectedComponents: ["CS", "SS", "CPL"],
      },
      {
        stepNumber: 4,
        description: "Direct Jump",
        hardwareAction:
          "Loads RIP from IA32_LSTAR (0xC0000082) without inspecting memory tables.",
        affectedComponents: ["RIP", "IA32_LSTAR"],
      },
    ],
    defaultProgram: `# syscall: 64-bit Fast Linux System Call
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov rax, 1          # sys_write (Linux x86_64)
    mov rdi, 1          # fd = 1 (stdout)
    mov rdx, 19         # count = 19 bytes
    syscall             # RCX <= RIP, R11 <= RFLAGS, RIP <= LSTAR

    mov rax, 60         # sys_exit
    xor rdi, rdi        # status = 0
    syscall
`,
  },
  {
    id: "svc",
    mnemonic: "svc #0",
    fullName: "Supervisor Call",
    arch: "arm64",
    archDisplay: "ARMv8-A / ARMv9-A (AArch64)",
    yearIntroduced: 2011,
    yearSiliconShipped: 2012,
    era: "ARMv8-A 64-bit Architecture Announcement",
    assemblerType: "GNU Assembler (.syntax unified / AArch64)",
    sourcePrivilege: "EL0 (User)",
    targetPrivilege: "EL1 (Kernel)",
    hardwareMechanism:
      "Synchronous Exception to EL1; saves PC into ELR_EL1, PSTATE into SPSR_EL1, updates ESR_EL1",
    returnInstruction: "eret",
    keyRegisters: [
      "X8 (syscall nr)",
      "X0-X5 (arguments & return)",
      "ELR_EL1 (return PC)",
      "ESR_EL1 (syndrome)",
    ],
    summary:
      "Generates a synchronous exception forcing an execution transition from Exception Level 0 (EL0 user) to Exception Level 1 (EL1 kernel). In accordance with the ARM ARM (DDI 0487), ESR_EL1 captures syndrome EC=0x15.",
    docsReference:
      "ARM Architecture Reference Manual ARMv8 (DDI 0487), Section C6.2.316 SVC",
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
        hardwareAction:
          "ESR_EL1 <= (EC: 0x15 for SVC in A64, IL: 1, ISS: imm16).",
        affectedComponents: ["ESR_EL1"],
      },
      {
        stepNumber: 3,
        description: "Transition EL",
        hardwareAction:
          "Switches current Exception Level to EL1; selects SP_EL1.",
        affectedComponents: ["PSTATE.EL", "SP"],
      },
      {
        stepNumber: 4,
        description: "Vector Table Offset",
        hardwareAction:
          "Branches to VBAR_EL1 + 0x400 (Synchronous from lower EL using AArch64).",
        affectedComponents: ["PC", "VBAR_EL1"],
      },
    ],
    defaultProgram: `// svc: ARM64 Supervisor Call
.syntax unified
.global _start

_start:
    mov x8, 64          // sys_write (ARM64 Linux)
    mov x0, 1           // fd = 1 (stdout)
    mov x2, 18          // length
    svc #0              // Transition EL0 -> EL1, ESR_EL1.EC = 0x15

    mov x8, 93          // sys_exit (ARM64 Linux)
    mov x0, 0           // exit status = 0
    svc #0
`,
  },
  {
    id: "hvc",
    mnemonic: "hvc #0",
    fullName: "Hypervisor Call",
    arch: "arm64",
    archDisplay: "ARMv8-A / ARMv9-A Virtualization",
    yearIntroduced: 2011,
    yearSiliconShipped: 2013,
    era: "ARMv8 Virtualization Extension (EL2)",
    assemblerType: "GNU Assembler AArch64",
    sourcePrivilege: "EL1 (Kernel)",
    targetPrivilege: "EL2 (Hypervisor)",
    hardwareMechanism:
      "Trap to EL2; saves PC into ELR_EL2, PSTATE into SPSR_EL2, ESR_EL2.EC = 0x16",
    returnInstruction: "eret",
    keyRegisters: [
      "X0 (Function ID / PSCI call)",
      "X1-X3 (args)",
      "ELR_EL2",
      "ESR_EL2",
    ],
    summary:
      "Used by an operating system running at EL1 to invoke services provided by a Type-1 Hypervisor (KVM/Xen) at EL2, such as CPU power control (PSCI CPU_ON) or virtual device traps.",
    docsReference:
      "ARM DDI 0487: HVC instruction & PSCI specification (ARM DEN 0022D)",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Context to EL2",
        hardwareAction: "ELR_EL2 <= next PC; SPSR_EL2 <= PSTATE.",
        affectedComponents: ["ELR_EL2", "SPSR_EL2"],
      },
      {
        stepNumber: 2,
        description: "Record Syndrome",
        hardwareAction: "ESR_EL2 <= (EC: 0x16 for HVC in A64, ISS: imm16).",
        affectedComponents: ["ESR_EL2"],
      },
      {
        stepNumber: 3,
        description: "Elevate to Hypervisor",
        hardwareAction: "PSTATE.EL switches from EL1 to EL2; selects SP_EL2.",
        affectedComponents: ["PSTATE.EL", "SP_EL2"],
      },
      {
        stepNumber: 4,
        description: "Branch to VBAR_EL2",
        hardwareAction: "Jumps to VBAR_EL2 + 0x400 exception vector offset.",
        affectedComponents: ["PC", "VBAR_EL2"],
      },
    ],
    defaultProgram: `// hvc: Hypervisor Call (EL1 -> EL2)
.global _start

_start:
    // PSCI CPU_ON call (0x84000003)
    mov x0, 0x84000003  // PSCI_0_2_FN_CPU_ON Function ID
    mov x1, 1           // Target CPU Core ID = 1
    mov x2, 0x80080000  // Entry point address for secondary core
    hvc #0              // Trap to Hypervisor at EL2

    // Check return status in X0 (0 = PSCI_SUCCESS)
    mov x8, 93
    svc #0
`,
  },
  {
    id: "smc",
    mnemonic: "smc #0",
    fullName: "Secure Monitor Call",
    arch: "arm64",
    archDisplay: "ARMv8-A / ARMv9-A TrustZone",
    yearIntroduced: 2004,
    yearSiliconShipped: 2005,
    era: "ARM TrustZone (ARMv6KZ/v7, adapted to EL3 in ARMv8)",
    assemblerType: "GNU Assembler AArch64",
    sourcePrivilege: "EL1 (Kernel)",
    targetPrivilege: "EL3 (Secure Monitor / Firmware)",
    hardwareMechanism:
      "Trap to EL3; switches from Normal World to Secure World / Root World; updates ESR_EL3.EC = 0x17",
    returnInstruction: "eret",
    keyRegisters: [
      "X0 (SMC Function Identifier - SMCCC)",
      "X1-X7 (parameters)",
      "ELR_EL3",
      "ESR_EL3",
    ],
    summary:
      "Gates communication across the hardware TrustZone security boundary. Traps from the Non-Secure OS into EL3 Secure Monitor / ARM Trusted Firmware (ATF) for cryptographic attestation or OP-TEE services.",
    docsReference: "SMC Calling Convention (SMCCC) PDD (ARM DEN 0028C)",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Context to EL3",
        hardwareAction: "ELR_EL3 <= next PC; SPSR_EL3 <= PSTATE.",
        affectedComponents: ["ELR_EL3", "SPSR_EL3"],
      },
      {
        stepNumber: 2,
        description: "Record Syndrome",
        hardwareAction: "ESR_EL3 <= (EC: 0x17 for SMC in A64).",
        affectedComponents: ["ESR_EL3"],
      },
      {
        stepNumber: 3,
        description: "World Transition",
        hardwareAction:
          "Changes security state from Normal World to Secure World; activates EL3.",
        affectedComponents: ["SCR_EL3", "PSTATE.EL"],
      },
      {
        stepNumber: 4,
        description: "Vector to EL3 Handler",
        hardwareAction:
          "Jumps to VBAR_EL3 + 0x400 (ATF Secure Monitor runtime service dispatcher).",
        affectedComponents: ["PC", "VBAR_EL3"],
      },
    ],
    defaultProgram: `// smc: ARM TrustZone Secure Monitor Call (EL1 -> EL3)
.global _start

_start:
    // SMCCC Call: 0x82000000 = Get Trusted OS UID
    mov x0, 0x82000000  // Fast Call, 32-bit, Standard Secure Service
    smc #0              // Transition into Secure World (EL3)

    // X0..X3 return the 128-bit UUID of the secure enclave
    mov x8, 93
    svc #0
`,
  },
  {
    id: "ecall",
    mnemonic: "ecall",
    fullName: "Environment Call",
    arch: "riscv",
    archDisplay: "RISC-V (RV32 / RV64)",
    yearIntroduced: 2014,
    yearSiliconShipped: 2016,
    era: "RISC-V Privileged Architecture Specification",
    assemblerType: "GNU Assembler (riscv64-unknown-elf-as)",
    sourcePrivilege: "U-Mode (User)",
    targetPrivilege: "S-Mode (Supervisor)",
    hardwareMechanism:
      "CSR update: saves PC to sepc/mepc, writes scause/mcause, updates sstatus/mstatus, jumps to stvec/mtvec",
    returnInstruction: "sret / mret",
    keyRegisters: [
      "a7 (syscall nr)",
      "a0-a5 (args)",
      "sepc (saved PC)",
      "scause (cause code 8 or 9)",
    ],
    summary:
      "A clean, unified transition instruction. Invoking ecall in U-mode traps to Supervisor mode (scause = 8). Invoking ecall in S-mode traps to Machine mode OpenSBI firmware (mcause = 9).",
    docsReference:
      "The RISC-V Instruction Set Manual, Volume II: Privileged Architecture, Section 3.1.10",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Save Return PC",
        hardwareAction:
          "sepc <= current PC (the address of the ecall instruction itself).",
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
        description: "Save Privilege Stack",
        hardwareAction:
          "sstatus.SPP <= U-Mode, sstatus.SPIE <= sstatus.SIE, sstatus.SIE <= 0.",
        affectedComponents: ["sstatus"],
      },
      {
        stepNumber: 4,
        description: "Vector Jump",
        hardwareAction: "PC <= stvec (Supervisor Trap Vector Base Address).",
        affectedComponents: ["PC", "stvec"],
      },
    ],
    defaultProgram: `# ecall: RISC-V Unified Environment Call
.section .text
.globl _start

_start:
    li a7, 64           # Linux sys_write (64)
    li a0, 1            # a0 = fd 1 (stdout)
    li a2, 17           # a2 = length
    ecall               # Traps from U-mode to S-mode (scause = 8)

    li a7, 93           # Linux sys_exit (93)
    li a0, 0            # exit code 0
    ecall
`,
  },
  {
    id: "tdcall",
    mnemonic: "tdcall",
    fullName: "Trust Domain Call",
    arch: "x86_64",
    archDisplay: "Intel TDX (Trust Domain Extensions)",
    yearIntroduced: 2020,
    yearSiliconShipped: 2023,
    era: "Intel 4th Gen Xeon (Sapphire Rapids) Confidential Computing",
    assemblerType: "x86_64 GNU Assembler / GAS (.byte 0x66, 0x0f, 0x01, 0xcc)",
    sourcePrivilege: "TD Guest (VMX Non-Root Encrypted)",
    targetPrivilege: "Intel SEAM (Secure Arbitration Mode)",
    hardwareMechanism:
      "Transitions into Intel SEAM firmware module; sanitizes registers before forwarding to host VMM",
    returnInstruction: "SEAMRET",
    keyRegisters: [
      "RAX (Leaf: 0=TDG.VP.VMCALL, 1=RTMR.EXTEND)",
      "RCX, RDX, R8-R11 (Shared VM params)",
      "SEAM status in RAX",
    ],
    summary:
      "Executed inside an encrypted Confidential VM (Trust Domain). Bypasses untrusted host hypervisor tampering by routing first through Intel SEAM, scrubbing sensitive registers before signaling the host VMM via TDG.VP.VMCALL.",
    docsReference:
      "Intel Trust Domain Extensions (Intel TDX) Module Architecture Specification, Section 4.1",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Validate SEAM Active",
        hardwareAction:
          "Hardware checks CPU SEAM mode is configured and SEAMRR range registers are locked.",
        affectedComponents: ["SEAMRR", "CPU Control Registers"],
      },
      {
        stepNumber: 2,
        description: "Trap to Intel SEAM",
        hardwareAction:
          "Transfers execution from Guest VMX Non-Root into authenticated Intel SEAM module code.",
        affectedComponents: ["SEAM Module", "RIP"],
      },
      {
        stepNumber: 3,
        description: "Scrub Non-Shared State",
        hardwareAction:
          "SEAM zeroes out unshared registers to prevent host hypervisor data leakage.",
        affectedComponents: ["RBX", "RSI", "RDI", "R12..R15"],
      },
      {
        stepNumber: 4,
        description: "Conditional VM-Exit",
        hardwareAction:
          "If leaf is TDG.VP.VMCALL, SEAM causes a controlled VM-exit to the untrusted host VMM.",
        affectedComponents: ["Host VMM", "VMCS"],
      },
    ],
    defaultProgram: `# tdcall: Intel TDX Confidential VM Call
.intel_syntax noprefix
.section .text
.global _start

_start:
    # Leaf 0 = TDG.VP.VMCALL (request service from host VMM)
    mov rax, 0          # RAX = 0 (TDG.VP.VMCALL leaf)
    mov rcx, 1          # Sub-service: 1 = Print / Output
    mov rdx, 0x1000     # Shared memory GPA
    tdcall              # Transition into SEAM; scrub registers

    # Check SEAM return status in RAX (0 = SUCCESS)
    mov rax, 60
    syscall
`,
  },
  {
    id: "seamcall",
    mnemonic: "seamcall",
    fullName: "Secure Arbitration Mode Call",
    arch: "x86_64",
    archDisplay: "Intel TDX Host VMM",
    yearIntroduced: 2020,
    yearSiliconShipped: 2023,
    era: "Intel 4th Gen Xeon (Sapphire Rapids) VMM Control",
    assemblerType: "x86_64 GNU Assembler / GAS (.byte 0x66, 0x0f, 0x01, 0xcf)",
    sourcePrivilege: "Host VMM (Root Ring 0)",
    targetPrivilege: "Intel SEAM (Secure Arbitration Mode)",
    hardwareMechanism:
      "Root VMX operation invocation of Intel SEAM module; enforces Secure EPT & KeyID allocation",
    returnInstruction: "SEAMRET",
    keyRegisters: [
      "RAX (Leaf: TDH.MNG.INIT, TDH.MEM.PAGE.AUG, TDH.VP.ENTER)",
      "RCX, RDX (TD Parameters)",
      "RAX (Status)",
    ],
    summary:
      "Executed by the Host Hypervisor (KVM / Hyper-V) in Ring 0 to control the TDX module. Allows allocating hardware-encrypted pages and running guest Trust Domains without the hypervisor possessing decryption keys.",
    docsReference:
      "Intel TDX Module Base Architecture: SEAMCALL Instruction Specification",
    hardwareSteps: [
      {
        stepNumber: 1,
        description: "Validate VMX Root Mode",
        hardwareAction:
          "CPU ensures CPL == 0 and CR4.VMXE == 1 in VMX root operation.",
        affectedComponents: ["CR4.VMXE", "CPL"],
      },
      {
        stepNumber: 2,
        description: "Enter SEAM Mode",
        hardwareAction:
          "CPU switches into Secure Arbitration Mode with SEAM identity-mapping.",
        affectedComponents: ["SEAM Mode", "RIP"],
      },
      {
        stepNumber: 3,
        description: "Cryptographic Page Check",
        hardwareAction:
          "SEAM checks P-SEAMLDR physical page authentication and updates Secure EPT.",
        affectedComponents: ["P-SEAMLDR", "Secure EPT", "KeyID Engine"],
      },
      {
        stepNumber: 4,
        description: "Return Status to VMM",
        hardwareAction:
          "SEAMRET returns status code in RAX (0x0 = TDX_SUCCESS) back to Host VMM.",
        affectedComponents: ["RAX", "RIP"],
      },
    ],
    defaultProgram: `# seamcall: Host Hypervisor Managing Trust Domain
.intel_syntax noprefix
.section .text
.global _start

_start:
    # Leaf 0x00000001 = TDH.MNG.INIT (Initialize TD Container)
    mov rax, 0x00000001 # SEAM leaf
    mov rcx, 0x7A000000 # TDR Physical Address (Target page)
    mov rdx, 42         # Assigned Hardware KeyID
    seamcall            # Enter SEAM, program cryptographic engine

    # Check RAX for TDX_SUCCESS (0)
    mov rax, 60
    syscall
`,
  },
];

export function getInstructionById(id: string): InstructionSpec | undefined {
  return INSTRUCTIONS_DATA.find((item) => item.id === id);
}
