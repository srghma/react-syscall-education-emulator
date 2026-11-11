export const CODE_EXAMPLES: Record<string, string> = {
  "int-0x80": `# Example: 32-bit Linux int 0x80 System Call
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov eax, 4          # sys_write syscall ID (4)
    mov ebx, 1          # File descriptor: 1 = stdout
    mov edx, 14         # Buffer length = 14 bytes
    int 0x80            # Hardware interrupt 0x80 -> traps to IDT gate, Ring 3 to Ring 0

    mov eax, 1          # sys_exit syscall ID (1)
    xor ebx, ebx        # Status code: 0
    int 0x80            # Halt execution
`,
  sysenter: `# Example: Intel Fast System Call (sysenter)
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov eax, 4          # sys_write
    mov ebx, 1          # stdout
    mov edx, 0x00401030 # edx = return address
    mov ecx, esp        # ecx = user stack pointer
    sysenter            # Direct jump to kernel via MSRs 0x174..0x176

    mov eax, 1          # sys_exit
    xor ebx, ebx        # status = 0
    sysenter
`,
  syscall: `# Example: 64-bit AMD64/Linux Fast Call (syscall)
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov rax, 1          # sys_write (Linux x86_64 = 1)
    mov rdi, 1          # fd = 1 (stdout)
    mov rdx, 22         # length = 22 bytes
    syscall             # RCX <= RIP, R11 <= RFLAGS, RIP <= IA32_LSTAR

    mov rax, 60         # sys_exit (Linux x86_64 = 60)
    xor rdi, rdi        # status = 0
    syscall
`,
  svc: `// Example: ARM64 Linux Supervisor Call (svc #0)
.syntax unified
.global _start

_start:
    mov x8, 64          // sys_write (AArch64 = 64)
    mov x0, 1           // fd = 1 (stdout)
    mov x2, 26          // byte length
    svc #0              // Transition EL0 -> EL1; ESR_EL1.EC = 0x15

    mov x8, 93          // sys_exit (AArch64 = 93)
    mov x0, 0           // exit code 0
    svc #0
`,
  hvc: `// Example: ARM64 Hypervisor Call (hvc #0)
.global _start

_start:
    mov x0, 0x84000003  // PSCI_0_2_FN_CPU_ON (Power State Coordination)
    mov x1, 1           // Target CPU Core = 1
    mov x2, 0x80080000  // Secondary core start address
    hvc #0              // Trap from Guest Kernel (EL1) to Hypervisor (EL2)

    mov x8, 93          // Exit
    svc #0
`,
  smc: `// Example: ARM64 TrustZone Secure Monitor Call (smc #0)
.global _start

_start:
    mov x0, 0x82000000  // SMCCC Function: Fast Call Query Enclave Status
    smc #0              // Trap from Normal World to Secure World (EL3)

    mov x8, 93          // Exit
    svc #0
`,
  ecall: `# Example: RISC-V 64-bit Environment Call (ecall)
.section .text
.globl _start

_start:
    li a7, 64           # Linux sys_write (64)
    li a0, 1            # fd = 1 (stdout)
    li a2, 19           # length = 19 bytes
    ecall               # Trap from U-mode to S-mode (scause = 8)

    li a7, 93           # Linux sys_exit (93)
    li a0, 0            # status = 0
    ecall
`,
  tdcall: `# Example: Intel TDX Confidential VM Call (tdcall)
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov rax, 0          # Leaf 0: TDG.VP.VMCALL
    mov rcx, 1          # Sub-function 1: Print/Logging
    mov rdx, 0x4000     # Shared page GPA
    tdcall              # Trap to Intel SEAM module; sanitize registers

    mov rax, 60         # Exit
    syscall
`,
  seamcall: `# Example: Host Hypervisor invoking Intel SEAM (seamcall)
.intel_syntax noprefix
.section .text
.global _start

_start:
    mov rax, 1          # Leaf 1: TDH.MNG.INIT (Init Trust Domain)
    mov rcx, 0x80000000 # TDR physical page address
    mov rdx, 7          # Assigned KeyID
    seamcall            # Enter SEAM; verify hardware crypto configuration

    mov rax, 60         # Host return
    syscall
`,
};
