import { BitVec, Except, Option } from "./fp";
import type { Arch, Instruction, Operand } from "./domain";
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
}

function cleanArchComment(raw: string, arch: Arch): string {
  let line = raw.replace(/\/\*.*?\*\//g, "");
  if (arch === "arm64") {
    const slash = line.indexOf("//");
    const at = line.indexOf("@");
    let cut = -1;
    if (slash !== -1 && at !== -1) cut = Math.min(slash, at);
    else if (slash !== -1) cut = slash;
    else if (at !== -1) cut = at;
    if (cut !== -1) line = line.substring(0, cut);
  } else {
    const match = line.match(/[#;//]/);
    if (match && match.index !== undefined) {
      line = line.substring(0, match.index);
    }
  }
  return line.trim();
}

function parseImmediateToken(token: string): BitVec<64> {
  const clean = token.trim().replace(/^[#$]/, "");
  const isNeg = clean.startsWith("-");
  const abs = isNeg ? clean.substring(1) : clean;
  let val = 0n;
  if (abs.startsWith("0x") || abs.startsWith("0X")) val = BigInt(abs);
  else if (abs.startsWith("0b") || abs.startsWith("0B")) val = BigInt(abs);
  else val = BigInt(abs);
  return BitVec.of(64, isNeg ? -val : val);
}

function parseOperand(
  token: string,
  symbols: ReadonlyMap<string, bigint>,
): Operand {
  let t = token.trim();

  // Strip memory bracket dereferences: [rip + msg] or [msg]
  if (t.startsWith("[") && t.endsWith("]")) {
    t = t.substring(1, t.length - 1).trim();
    if (t.toLowerCase().startsWith("rip +")) {
      t = t.substring(5).trim();
    }
  }

  // Symbol reference resolution (e.g. msg -> 0x00402000, len -> 33)
  if (symbols.has(t)) {
    return { tag: "imm", value: BitVec.of(64, symbols.get(t) ?? 0n) };
  }

  if (t.startsWith("#") || t.startsWith("$") || /^[-+]?[0-9]/.test(t)) {
    return { tag: "imm", value: parseImmediateToken(t) };
  }

  return { tag: "reg", name: t.toLowerCase() };
}

export function parseAssembly(
  code: string,
  arch: Arch,
): Except<string, Program> {
  const rawLines = code.split("\n");
  const lines: SourceLine[] = [];
  const executable: ExecutableInstruction[] = [];
  const symbols = new Map<string, bigint>();
  let mem = new PureMemory();

  let dataCursor = 0x00402000n;
  let textCursor = 0x00400000n;
  let currentSection: "text" | "data" | "bss" = "text";
  let pendingLabel: string | null = null;

  // -------------------------------------------------------------------------
  // Pass 1: Section Tracking, Data Allocation & Symbol Table Construction
  // -------------------------------------------------------------------------
  for (let idx = 0; idx < rawLines.length; idx++) {
    const cleaned = cleanArchComment(rawLines[idx], arch);
    if (!cleaned) continue;

    // Detect section transitions
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

    // Check for label declarations: "label:" or "label: instruction/data"
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
      // String directives: .asciz, .ascii, .string
      if (
        rest.startsWith(".asciz") ||
        rest.startsWith(".ascii") ||
        rest.startsWith(".string")
      ) {
        const match = rest.match(/["'](.*?)["']/);
        const strVal = match
          ? match[1].replace(/\\n/g, "\n").replace(/\\t/g, "\t")
          : "";
        if (activeLabel) {
          symbols.set(activeLabel, dataCursor);
        }
        mem = mem.writeAscii(dataCursor, strVal);
        const isAsciz = !rest.startsWith(".ascii");
        dataCursor += BigInt(strVal.length + (isAsciz ? 1 : 0));
        continue;
      }

      // Equate directives: "len = . - msg" or "len = 32"
      if (rest.includes("=")) {
        const parts = rest.split("=");
        const symName = parts[0].trim();
        const expr = parts[1].trim();
        if (expr.includes(".") && expr.includes("-")) {
          const baseName = expr.split("-")[1].trim();
          const baseAddr = symbols.get(baseName) ?? 0x00402000n;
          symbols.set(symName, dataCursor - baseAddr);
        } else if (/^[0-9]+$/.test(expr)) {
          symbols.set(symName, BigInt(expr));
        }
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

  // -------------------------------------------------------------------------
  // Pass 2: Instruction Parsing (Restricted to .text Section)
  // -------------------------------------------------------------------------
  currentSection = "text";
  textCursor = 0x00400000n;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx];
    let cleaned = cleanArchComment(raw, arch);

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

    // In data or bss sections, lines are non-executable data declarations
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

    // Skip empty lines, standalone labels, or assembler directives
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

    const firstSpace = cleaned.indexOf(" ");
    const mnemonic = (
      firstSpace === -1 ? cleaned : cleaned.substring(0, firstSpace)
    ).toLowerCase();
    const argsStr =
      firstSpace === -1 ? "" : cleaned.substring(firstSpace).trim();
    const args = argsStr ? argsStr.split(",").map((s) => s.trim()) : [];

    let instr: Instruction;

    switch (mnemonic) {
      case "mov":
      case "li":
      case "la":
      case "adr":
      case "lea":
        instr = {
          tag: "mov",
          dst: args[0],
          src: parseOperand(args[1], symbols),
        };
        break;
      case "xor":
        instr = {
          tag: "xor",
          dst: args[0],
          src: parseOperand(args[1], symbols),
        };
        break;
      case "add":
      case "addi":
        instr = {
          tag: "add",
          dst: args[0],
          src: parseOperand(args.length === 3 ? args[2] : args[1], symbols),
        };
        break;
      case "sub":
      case "subs":
        instr = {
          tag: "sub",
          dst: args[0],
          src: parseOperand(args.length === 3 ? args[2] : args[1], symbols),
        };
        break;
      case "cmp":
        instr = {
          tag: "cmp",
          op1: args[0],
          op2: parseOperand(args[1], symbols),
        };
        break;
      case "syscall":
        instr = { tag: "syscall" };
        break;
      case "sysenter":
        instr = { tag: "sysenter" };
        break;
      case "sysexit":
        instr = { tag: "sysexit" };
        break;
      case "int":
        instr = {
          tag: "int",
          vector: Number(parseImmediateToken(args[0]).val),
        };
        break;
      case "iret":
      case "iretd":
        instr = { tag: "iret" };
        break;
      case "svc":
        instr = {
          tag: "svc",
          imm: args[0] ? Number(parseImmediateToken(args[0]).val) : 0,
        };
        break;
      case "hvc":
        instr = {
          tag: "hvc",
          imm: args[0] ? Number(parseImmediateToken(args[0]).val) : 0,
        };
        break;
      case "smc":
        instr = {
          tag: "smc",
          imm: args[0] ? Number(parseImmediateToken(args[0]).val) : 0,
        };
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
      default:
        return Except.error(
          `Line ${idx + 1}: Unknown or unsupported mnemonic '${mnemonic}' in "${raw.trim()}"`,
        );
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

  return Except.ok({
    lines,
    executableInstructions: executable,
    initialMemory: mem,
    symbols,
  });
}
