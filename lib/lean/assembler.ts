import { BitVec, Except, Option } from "./fp";
import type { Arch, Instruction, Operand, ParseDiagnostic } from "./domain";
import { PureMemory } from "./memory";

export interface SourceLine {
  readonly lineNum: number;
  readonly rawText: string;
  readonly instruction: Option<Instruction>;
}

export interface ExecutableInstruction {
  readonly address: BitVec<64>;
  readonly lineIndex: number;
  readonly instr: Instruction;
}

export interface Program {
  readonly lines: readonly SourceLine[];
  readonly executableInstructions: readonly ExecutableInstruction[];
  readonly initialMemory: PureMemory;
  readonly symbols: ReadonlyMap<string, bigint>;
  readonly entryPoint: bigint;
}

const VALID_REGISTERS: Record<Arch, Set<string>> = {
  x86_64: new Set([
    "rax",
    "rbx",
    "rcx",
    "rdx",
    "rsi",
    "rdi",
    "rbp",
    "rsp",
    "r8",
    "r9",
    "r10",
    "r11",
    "r12",
    "r13",
    "r14",
    "r15",
    "eax",
    "ebx",
    "ecx",
    "edx",
    "esi",
    "edi",
    "ebp",
    "esp",
    "ax",
    "bx",
    "cx",
    "dx",
    "si",
    "di",
    "bp",
    "sp",
    "al",
    "bl",
    "cl",
    "dl",
    "ah",
    "bh",
    "ch",
    "dh",
  ]),
  x86_32: new Set([
    "eax",
    "ebx",
    "ecx",
    "edx",
    "esi",
    "edi",
    "ebp",
    "esp",
    "ax",
    "bx",
    "cx",
    "dx",
    "si",
    "di",
    "bp",
    "sp",
    "al",
    "bl",
    "cl",
    "dl",
    "ah",
    "bh",
    "ch",
    "dh",
  ]),
  arm64: new Set([
    "sp",
    "wsp",
    "xzr",
    "wzr",
    "lr",
    "fp",
    ...Array.from({ length: 31 }, (_, i) => `x${i}`),
    ...Array.from({ length: 31 }, (_, i) => `w${i}`),
  ]),
  riscv: new Set([
    "zero",
    "ra",
    "sp",
    "gp",
    "tp",
    "t0",
    "t1",
    "t2",
    "s0",
    "s1",
    "a0",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "s2",
    "s3",
    "s4",
    "s5",
    "s6",
    "s7",
    "s8",
    "s9",
    "s10",
    "s11",
    "t3",
    "t4",
    "t5",
    "t6",
    "fp",
    ...Array.from({ length: 32 }, (_, i) => `x${i}`),
  ]),
};

function stripComment(raw: string, arch: Arch): string {
  let insideQuote = false;
  let quoteChar = "";

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (insideQuote) {
      if (c === "\\" && i + 1 < raw.length) {
        i++;
      } else if (c === quoteChar) {
        insideQuote = false;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      insideQuote = true;
      quoteChar = c;
      continue;
    }

    if (arch === "arm64") {
      if (c === "/" && raw[i + 1] === "/") {
        return raw.substring(0, i).trim();
      }
    } else {
      if (c === "#" || (c === "/" && raw[i + 1] === "/")) {
        return raw.substring(0, i).trim();
      }
    }
  }

  return raw.trim();
}

function parseImmediateSafe(
  token: string,
  line: number,
): Except<ParseDiagnostic, BitVec<64>> {
  const clean = token.trim().replace(/^[#$]/, "");
  if (!clean || clean === "0x" || clean === "0b" || clean === "-") {
    return Except.error({
      line,
      col: 1,
      message: `Invalid immediate literal: '${token}'`,
    });
  }

  const isNeg = clean.startsWith("-");
  const abs = isNeg ? clean.substring(1) : clean;

  try {
    let val = 0n;
    if (abs.startsWith("0x") || abs.startsWith("0X")) {
      val = BigInt(abs);
    } else if (abs.startsWith("0b") || abs.startsWith("0B")) {
      val = BigInt(abs);
    } else {
      val = BigInt(abs);
    }
    return Except.ok(BitVec.of(64, isNeg ? -val : val));
  } catch {
    return Except.error({
      line,
      col: 1,
      message: `Syntax error evaluating immediate '${token}'`,
    });
  }
}

function parseOperand(
  token: string,
  arch: Arch,
  line: number,
  symbols: ReadonlyMap<string, bigint>,
): Except<ParseDiagnostic, Operand> {
  let t = token.trim();
  if (!t) {
    return Except.error({ line, col: 1, message: "Missing expected operand" });
  }

  if (t.toLowerCase().startsWith("offset ")) {
    t = t.substring(7).trim();
    if (symbols.has(t)) {
      return Except.ok({
        tag: "imm",
        value: BitVec.of(64, symbols.get(t) ?? 0n),
      });
    }
  }

  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.substring(1, t.length - 1).trim();
    if (
      inner.toLowerCase().startsWith("rip +") ||
      inner.toLowerCase().startsWith("rip+")
    ) {
      const sym = inner.replace(/^rip\s*\+\s*/i, "").trim();
      if (symbols.has(sym)) {
        return Except.ok({
          tag: "mem",
          mem: {
            baseReg: "rip",
            offset: symbols.get(sym) ?? 0n,
            isRipRelative: true,
          },
        });
      }
    }

    const plusIdx = inner.indexOf("+");
    const minusIdx = inner.indexOf("-");
    if (plusIdx !== -1) {
      const base = inner.substring(0, plusIdx).trim();
      const offToken = inner.substring(plusIdx + 1).trim();
      const offRes = parseImmediateSafe(offToken, line);
      if (offRes.tag === "error") return offRes;
      return Except.ok({
        tag: "mem",
        mem: { baseReg: base.toLowerCase(), offset: offRes.value.val },
      });
    }
    if (minusIdx > 0) {
      const base = inner.substring(0, minusIdx).trim();
      const offToken = inner.substring(minusIdx + 1).trim();
      const offRes = parseImmediateSafe(offToken, line);
      if (offRes.tag === "error") return offRes;
      return Except.ok({
        tag: "mem",
        mem: { baseReg: base.toLowerCase(), offset: -offRes.value.val },
      });
    }

    if (VALID_REGISTERS[arch].has(inner.toLowerCase())) {
      return Except.ok({
        tag: "mem",
        mem: { baseReg: inner.toLowerCase(), offset: 0n },
      });
    }

    if (symbols.has(inner)) {
      return Except.ok({
        tag: "mem",
        mem: { baseReg: "", offset: symbols.get(inner) ?? 0n },
      });
    }
  }

  if (symbols.has(t)) {
    return Except.ok({
      tag: "imm",
      value: BitVec.of(64, symbols.get(t) ?? 0n),
    });
  }

  if (t.startsWith("#") || t.startsWith("$") || /^[-+]?[0-9]/.test(t)) {
    const immRes = parseImmediateSafe(t, line);
    if (immRes.tag === "error") return immRes;
    return Except.ok({ tag: "imm", value: immRes.value });
  }

  const lower = t.toLowerCase();
  if (VALID_REGISTERS[arch].has(lower)) {
    return Except.ok({ tag: "reg", name: lower });
  }

  return Except.error({
    line,
    col: 1,
    message: `Unknown register or unresolved symbol '${t}' for architecture ${arch}`,
  });
}

function resolveAddress(
  token: string,
  symbols: ReadonlyMap<string, bigint>,
): bigint | null {
  let t = token.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    t = t.substring(1, t.length - 1).trim();
  }
  if (
    t.toLowerCase().startsWith("rip +") ||
    t.toLowerCase().startsWith("rip+")
  ) {
    t = t.replace(/^rip\s*\+\s*/i, "").trim();
  }
  if (t.toLowerCase().startsWith("offset ")) {
    t = t.substring(7).trim();
  }
  return symbols.get(t) ?? null;
}

function unescapeString(raw: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\\" && i + 1 < raw.length) {
      i++;
      const next = raw[i];
      if (next === "n") bytes.push(10);
      else if (next === "t") bytes.push(9);
      else if (next === "r") bytes.push(13);
      else if (next === "0") bytes.push(0);
      else if (next === '"') bytes.push(34);
      else if (next === "\\") bytes.push(92);
      else if (next === "x" && i + 2 < raw.length) {
        const hex = raw.substring(i + 1, i + 3);
        bytes.push(Number.parseInt(hex, 16) || 0);
        i += 2;
      } else {
        bytes.push(next.charCodeAt(0));
      }
    } else {
      bytes.push(raw.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
}

export function parseAssembly(
  code: string,
  arch: Arch,
): Except<ParseDiagnostic, Program> {
  const rawLines = code.split("\n");
  const lines: SourceLine[] = [];
  const executable: ExecutableInstruction[] = [];
  const symbols = new Map<string, bigint>();
  let mem = new PureMemory();

  let dataCursor = 0x00402000n;
  let textCursor = 0x00400000n;
  let currentSection: "text" | "data" | "bss" = "text";
  let pendingLabel: string | null = null;

  // Pass 1: Section Tracking, Data Allocation, Symbol Construction
  for (let idx = 0; idx < rawLines.length; idx++) {
    const cleaned = stripComment(rawLines[idx], arch);
    if (!cleaned) continue;

    if (
      cleaned.startsWith(".section .data") ||
      cleaned.startsWith(".data") ||
      cleaned.startsWith(".section .rodata")
    ) {
      currentSection = "data";
      continue;
    }
    if (
      cleaned.startsWith(".section .text") ||
      cleaned.startsWith(".text") ||
      cleaned.startsWith(".code")
    ) {
      currentSection = "text";
      continue;
    }
    if (cleaned.startsWith(".section .bss") || cleaned.startsWith(".bss")) {
      currentSection = "bss";
      continue;
    }

    if (
      cleaned.includes("=") ||
      cleaned.startsWith(".equ ") ||
      cleaned.startsWith(".set ")
    ) {
      const exprClean = cleaned.replace(/^\.(?:equ|set)\s+/, "");
      const [symName, rhs] = exprClean.includes("=")
        ? exprClean.split("=")
        : exprClean.split(",");
      if (symName && rhs) {
        const s = symName.trim();
        const expr = rhs.trim();
        if (expr.includes(".") && expr.includes("-")) {
          const baseName = expr.split("-")[1].trim();
          const baseAddr = symbols.get(baseName) ?? 0x00402000n;
          symbols.set(s, dataCursor - baseAddr);
        } else {
          const immRes = parseImmediateSafe(expr, idx + 1);
          if (immRes.tag === "ok") {
            symbols.set(s, immRes.value.val);
          }
        }
      }
      continue;
    }

    let label = "";
    let rest = cleaned;
    const colonIdx = cleaned.indexOf(":");
    if (colonIdx !== -1) {
      label = cleaned.substring(0, colonIdx).trim();
      rest = cleaned.substring(colonIdx + 1).trim();
    }

    const activeLabel = label || pendingLabel;
    if (label && !rest) {
      pendingLabel = label;
      continue;
    }
    pendingLabel = null;

    if (currentSection === "data") {
      if (
        rest.startsWith(".asciz") ||
        rest.startsWith(".ascii") ||
        rest.startsWith(".string")
      ) {
        const match = rest.match(/["'](.*)["']/);
        const strBytes = match ? unescapeString(match[1]) : new Uint8Array();
        if (activeLabel) {
          symbols.set(activeLabel, dataCursor);
        }
        mem = mem.writeBytes(dataCursor, strBytes);
        const isAsciz = !rest.startsWith(".ascii");
        if (isAsciz) {
          mem = mem.writeByte(dataCursor + BigInt(strBytes.length), 0);
        }
        dataCursor += BigInt(strBytes.length + (isAsciz ? 1 : 0));
      }
    } else if (currentSection === "text") {
      if (activeLabel && !rest.startsWith(".")) {
        symbols.set(activeLabel, textCursor);
      }
      if (rest && !rest.startsWith(".") && !rest.endsWith(":")) {
        textCursor += 4n;
      }
    }
  }

  // Pass 2: Executable Instruction Assembly
  currentSection = "text";
  textCursor = 0x00400000n;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx];
    let cleaned = stripComment(raw, arch);

    if (
      cleaned.startsWith(".section .data") ||
      cleaned.startsWith(".data") ||
      cleaned.startsWith(".section .rodata")
    ) {
      currentSection = "data";
      lines.push({
        lineNum: idx + 1,
        rawText: raw,
        instruction: Option.none(),
      });
      continue;
    }
    if (
      cleaned.startsWith(".section .text") ||
      cleaned.startsWith(".text") ||
      cleaned.startsWith(".code")
    ) {
      currentSection = "text";
      lines.push({
        lineNum: idx + 1,
        rawText: raw,
        instruction: Option.none(),
      });
      continue;
    }
    if (cleaned.startsWith(".section .bss") || cleaned.startsWith(".bss")) {
      currentSection = "bss";
      lines.push({
        lineNum: idx + 1,
        rawText: raw,
        instruction: Option.none(),
      });
      continue;
    }

    if (currentSection !== "text") {
      lines.push({
        lineNum: idx + 1,
        rawText: raw,
        instruction: Option.none(),
      });
      continue;
    }

    if (cleaned.includes(":") && !cleaned.endsWith(":")) {
      cleaned = cleaned.substring(cleaned.indexOf(":") + 1).trim();
    }

    if (
      !cleaned ||
      cleaned.endsWith(":") ||
      cleaned.startsWith(".") ||
      cleaned.includes("=")
    ) {
      lines.push({
        lineNum: idx + 1,
        rawText: raw,
        instruction: Option.none(),
      });
      continue;
    }

    const parts = cleaned.split(/\s+/);
    const mnemonic = parts[0].toLowerCase();
    const argsStr = cleaned.substring(parts[0].length).trim();
    const args = argsStr ? argsStr.split(",").map((s) => s.trim()) : [];

    let instr: Instruction;

    switch (mnemonic) {
      case "lea":
      case "adr":
      case "la": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: `'${mnemonic}' requires destination register and source label`,
          });
        }
        const addr = resolveAddress(args[1], symbols);
        if (addr !== null) {
          instr = {
            tag: "lea",
            dst: args[0].toLowerCase(),
            address: BitVec.of(64, addr),
          };
        } else {
          const srcRes = parseOperand(args[1], arch, idx + 1, symbols);
          if (srcRes.tag === "error") return srcRes;
          instr = { tag: "mov", dst: args[0].toLowerCase(), src: srcRes.value };
        }
        break;
      }

      case "mov":
      case "li": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: `'${mnemonic}' requires destination and source operands`,
          });
        }
        const srcRes = parseOperand(args[1], arch, idx + 1, symbols);
        if (srcRes.tag === "error") return srcRes;
        instr = { tag: "mov", dst: args[0].toLowerCase(), src: srcRes.value };
        break;
      }

      case "xor": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'xor' requires two operands",
          });
        }
        const srcRes = parseOperand(args[1], arch, idx + 1, symbols);
        if (srcRes.tag === "error") return srcRes;
        instr = { tag: "xor", dst: args[0].toLowerCase(), src: srcRes.value };
        break;
      }

      case "and": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'and' requires two operands",
          });
        }
        const srcRes = parseOperand(args[1], arch, idx + 1, symbols);
        if (srcRes.tag === "error") return srcRes;
        instr = { tag: "and", dst: args[0].toLowerCase(), src: srcRes.value };
        break;
      }

      case "or": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'or' requires two operands",
          });
        }
        const srcRes = parseOperand(args[1], arch, idx + 1, symbols);
        if (srcRes.tag === "error") return srcRes;
        instr = { tag: "or", dst: args[0].toLowerCase(), src: srcRes.value };
        break;
      }

      case "inc": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'inc' requires register destination",
          });
        }
        instr = { tag: "inc", dst: args[0].toLowerCase() };
        break;
      }

      case "dec": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'dec' requires register destination",
          });
        }
        instr = { tag: "dec", dst: args[0].toLowerCase() };
        break;
      }

      case "push": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'push' requires operand",
          });
        }
        const srcRes = parseOperand(args[0], arch, idx + 1, symbols);
        if (srcRes.tag === "error") return srcRes;
        instr = { tag: "push", src: srcRes.value };
        break;
      }

      case "pop": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'pop' requires register destination",
          });
        }
        instr = { tag: "pop", dst: args[0].toLowerCase() };
        break;
      }

      case "jmp": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'jmp' requires target label",
          });
        }
        instr = { tag: "jmp", target: args[0] };
        break;
      }

      case "je":
      case "jz":
      case "jne":
      case "jnz": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: `'${mnemonic}' requires target label`,
          });
        }
        const cond =
          mnemonic.endsWith("e") || mnemonic.endsWith("z")
            ? mnemonic.startsWith("j") && !mnemonic.includes("n")
              ? "z"
              : "nz"
            : "nz";
        instr = { tag: "jcc", condition: cond as "z" | "nz", target: args[0] };
        break;
      }

      case "b": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'b' requires target label",
          });
        }
        instr = { tag: "b", target: args[0] };
        break;
      }

      case "b.eq":
      case "b.ne": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: `'${mnemonic}' requires target label`,
          });
        }
        instr = {
          tag: "b_cond",
          condition: mnemonic === "b.eq" ? "eq" : "ne",
          target: args[0],
        };
        break;
      }

      case "add":
      case "addi": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: `'${mnemonic}' requires at least 2 operands`,
          });
        }
        const s1 = args.length === 3 ? args[1] : args[0];
        const s2 = args.length === 3 ? args[2] : args[1];
        const res1 = parseOperand(s1, arch, idx + 1, symbols);
        if (res1.tag === "error") return res1;
        const res2 = parseOperand(s2, arch, idx + 1, symbols);
        if (res2.tag === "error") return res2;
        instr = {
          tag: "add",
          dst: args[0].toLowerCase(),
          src1: res1.value,
          src2: res2.value,
        };
        break;
      }

      case "sub":
      case "subs": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: `'${mnemonic}' requires at least 2 operands`,
          });
        }
        const s1 = args.length === 3 ? args[1] : args[0];
        const s2 = args.length === 3 ? args[2] : args[1];
        const res1 = parseOperand(s1, arch, idx + 1, symbols);
        if (res1.tag === "error") return res1;
        const res2 = parseOperand(s2, arch, idx + 1, symbols);
        if (res2.tag === "error") return res2;
        instr = {
          tag: "sub",
          dst: args[0].toLowerCase(),
          src1: res1.value,
          src2: res2.value,
        };
        break;
      }

      case "cmp": {
        if (args.length < 2) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'cmp' requires two operands",
          });
        }
        const op2Res = parseOperand(args[1], arch, idx + 1, symbols);
        if (op2Res.tag === "error") return op2Res;
        instr = { tag: "cmp", op1: args[0].toLowerCase(), op2: op2Res.value };
        break;
      }

      case "int": {
        if (args.length < 1) {
          return Except.error({
            line: idx + 1,
            col: 1,
            message: "'int' requires an interrupt vector",
          });
        }
        const vecRes = parseImmediateSafe(args[0], idx + 1);
        if (vecRes.tag === "error") return vecRes;
        instr = { tag: "int", vector: Number(vecRes.value.val) };
        break;
      }

      case "svc": {
        const immVal = args[0]
          ? parseImmediateSafe(args[0], idx + 1)
          : Except.ok(BitVec.zero(64));
        if (immVal.tag === "error") return immVal;
        instr = { tag: "svc", imm: Number(immVal.value.val) };
        break;
      }

      case "hvc": {
        const immVal = args[0]
          ? parseImmediateSafe(args[0], idx + 1)
          : Except.ok(BitVec.zero(64));
        if (immVal.tag === "error") return immVal;
        instr = { tag: "hvc", imm: Number(immVal.value.val) };
        break;
      }

      case "smc": {
        const immVal = args[0]
          ? parseImmediateSafe(args[0], idx + 1)
          : Except.ok(BitVec.zero(64));
        if (immVal.tag === "error") return immVal;
        instr = { tag: "smc", imm: Number(immVal.value.val) };
        break;
      }

      case "syscall":
        instr = { tag: "syscall" };
        break;
      case "sysenter":
        instr = { tag: "sysenter" };
        break;
      case "sysexit":
        instr = { tag: "sysexit" };
        break;
      case "iret":
      case "iretd":
        instr = { tag: "iret" };
        break;
      case "sysret":
      case "sysretq":
        instr = { tag: "sysret" };
        break;
      case "eret":
        instr = { tag: "eret" };
        break;
      case "ecall":
        instr = { tag: "ecall" };
        break;
      case "sret":
        instr = { tag: "sret" };
        break;
      case "mret":
        instr = { tag: "mret" };
        break;
      case "tdcall":
        instr = { tag: "tdcall" };
        break;
      case "seamcall":
        instr = { tag: "seamcall" };
        break;
      case "seamret":
        instr = { tag: "seamret" };
        break;
      case "hlt":
        instr = { tag: "hlt" };
        break;
      case "nop":
        instr = { tag: "nop" };
        break;

      default:
        return Except.error({
          line: idx + 1,
          col: 1,
          message: `Unknown mnemonic '${mnemonic}' in instruction '${raw.trim()}'`,
        });
    }

    lines.push({
      lineNum: idx + 1,
      rawText: raw,
      instruction: Option.some(instr),
    });
    executable.push({
      address: BitVec.of(64, textCursor),
      lineIndex: idx,
      instr,
    });
    textCursor += 4n;
  }

  const entryPoint =
    symbols.get("_start") ??
    (executable.length > 0 ? executable[0].address.val : 0x00400000n);

  return Except.ok({
    lines,
    executableInstructions: executable,
    initialMemory: mem,
    symbols,
    entryPoint,
  });
}
