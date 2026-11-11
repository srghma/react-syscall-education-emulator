"use client";

import type React from "react";
import type { Arch } from "@/lib/lean/domain";

interface AssemblyEditorProps {
  code: string;
  onChange: (value: string) => void;
  activeLineIndex: number;
  isHalted: boolean;
  arch: Arch;
}

const TRAP_INSTRUCTIONS = new Set([
  "syscall",
  "sysenter",
  "sysexit",
  "int",
  "iret",
  "iretd",
  "svc",
  "hvc",
  "smc",
  "eret",
  "ecall",
  "sret",
  "mret",
  "tdcall",
  "seamcall",
  "seamret",
]);

const STANDARD_MNEMONICS = new Set([
  "mov",
  "li",
  "la",
  "adr",
  "lea",
  "xor",
  "add",
  "addi",
  "sub",
  "subs",
  "cmp",
  "hlt",
  "push",
  "pop",
  "jmp",
  "b",
  "bl",
  "jal",
  "ret",
]);

const REGISTERS = new Set([
  // x86
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
  "rip",
  "eip",
  "flags",
  "eflags",
  "rflags",
  // ARM64
  "x0",
  "x1",
  "x2",
  "x3",
  "x4",
  "x5",
  "x6",
  "x7",
  "x8",
  "x9",
  "x10",
  "x11",
  "x12",
  "x13",
  "x14",
  "x15",
  "x16",
  "x17",
  "x18",
  "x19",
  "x20",
  "x21",
  "x22",
  "x23",
  "x24",
  "x25",
  "x26",
  "x27",
  "x28",
  "x29",
  "x30",
  "w0",
  "w1",
  "w2",
  "w3",
  "w4",
  "w5",
  "w6",
  "w7",
  "w8",
  "w9",
  "w10",
  "w11",
  "w12",
  "w13",
  "w14",
  "w15",
  "w16",
  "w17",
  "w18",
  "w19",
  "w20",
  "w21",
  "w22",
  "w23",
  "w24",
  "w25",
  "w26",
  "w27",
  "w28",
  "w29",
  "w30",
  "sp",
  "wsp",
  "xzr",
  "wzr",
  "lr",
  "fp",
  "pc",
  // RISC-V
  "zero",
  "ra",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "t3",
  "t4",
  "t5",
  "t6",
  "s0",
  "s1",
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
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
]);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Single-pass lexer for assembly lines.
 * Eliminates regex chaining bugs and avoids mangling nested HTML tags.
 */
function highlightLine(line: string, arch: Arch): string {
  if (!line) return "&nbsp;";

  // In ARM64, // and @ are comments (# is the immediate prefix)
  // In x86 / RISC-V, #, ;, and // are comments
  const commentPattern =
    arch === "arm64" ? "(?:\\/\\/|@).*$" : "(?:[#;]|\\/\\/).*$";

  const tokenRegex = new RegExp(
    [
      `(?<comment>${commentPattern})`,
      `(?<string>"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`,
      `(?<label>^[a-zA-Z_.$][a-zA-Z0-9_.$]*:)`,
      `(?<directive>\\.[a-zA-Z_][a-zA-Z0-9_.]*)`,
      `(?<number>[#$]?[-+]?(?:0x[0-9a-fA-F]+|0b[01]+|[0-9]+))`,
      `(?<word>[a-zA-Z_][a-zA-Z0-9_]*)`,
      `(?<whitespace>\\s+)`,
      `(?<other>.)`,
    ].join("|"),
    "g",
  );

  let html = "";
  let match: RegExpExecArray | null = tokenRegex.exec(line);

  while (match !== null) {
    const text = match[0];
    const groups = match.groups ?? {};

    if (groups.comment) {
      html += `<span class="text-zinc-500 italic">${escapeHtml(text)}</span>`;
    } else if (groups.string) {
      html += `<span class="text-amber-300 font-medium">${escapeHtml(text)}</span>`;
    } else if (groups.label) {
      html += `<span class="text-amber-400 font-bold">${escapeHtml(text)}</span>`;
    } else if (groups.directive) {
      html += `<span class="text-purple-400 font-semibold">${escapeHtml(text)}</span>`;
    } else if (groups.number) {
      html += `<span class="text-cyan-300 font-mono">${escapeHtml(text)}</span>`;
    } else if (groups.word) {
      const lower = text.toLowerCase();
      if (TRAP_INSTRUCTIONS.has(lower)) {
        html += `<span class="text-emerald-400 font-extrabold bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-800/80 shadow-sm">${escapeHtml(text)}</span>`;
      } else if (STANDARD_MNEMONICS.has(lower)) {
        html += `<span class="text-sky-400 font-bold">${escapeHtml(text)}</span>`;
      } else if (REGISTERS.has(lower)) {
        html += `<span class="text-orange-300 font-medium">${escapeHtml(text)}</span>`;
      } else {
        html += `<span class="text-zinc-200">${escapeHtml(text)}</span>`;
      }
    } else {
      html += escapeHtml(text);
    }

    match = tokenRegex.exec(line);
  }

  return html || "&nbsp;";
}

export default function AssemblyEditor({
  code,
  onChange,
  activeLineIndex,
  isHalted,
  arch,
}: AssemblyEditorProps) {
  const lines = code.split("\n");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const nextCode = `${code.substring(0, start)}    ${code.substring(end)}`;
      onChange(nextCode);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      });
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-hidden shadow-sm">
      <div className="flex border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-[11px] text-zinc-400 items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-zinc-300">
          Source Program ({lines.length} lines)
        </span>
        <span className="font-sans text-[10px] text-zinc-500">
          Auto-expanding &bull; Syntax Colorized
        </span>
      </div>

      <div className="relative flex">
        {/* Line Numbers & Execution Pointer Gutter */}
        <div className="select-none bg-zinc-900/40 text-zinc-600 dark:text-zinc-500 py-3 px-3 text-right border-r border-zinc-800/80 font-mono text-xs leading-6 space-y-0 min-w-[3.5rem]">
          {lines.map((_, i) => {
            const isActive = i === activeLineIndex && !isHalted;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: line index is the stable line number position
                key={i}
                className="flex items-center justify-end gap-1.5 h-6"
              >
                {isActive && (
                  <span className="text-emerald-400 text-[10px] font-bold animate-pulse">
                    &#9654;
                  </span>
                )}
                <span className={isActive ? "text-emerald-400 font-bold" : ""}>
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>

        {/* Dual-Layer Colorized Editor (Non-Scrollable) */}
        <div className="relative flex-1">
          {/* Highlighted Visual Layer */}
          <pre
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 py-3 px-4 m-0 font-mono text-xs leading-6 whitespace-pre overflow-hidden"
          >
            {lines.map((line, i) => {
              const isActive = i === activeLineIndex && !isHalted;
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: line index defines the visual buffer row
                  key={i}
                  className={`h-6 ${
                    isActive
                      ? "bg-emerald-950/30 -mx-4 px-4 border-l-2 border-emerald-400"
                      : ""
                  }`}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: Tokenized assembly highlighter
                  dangerouslySetInnerHTML={{
                    __html: highlightLine(line, arch),
                  }}
                />
              );
            })}
          </pre>

          {/* Transparent Input Layer */}
          <textarea
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            rows={Math.max(lines.length, 12)}
            className="w-full h-full py-3 px-4 font-mono text-xs leading-6 bg-transparent text-transparent caret-emerald-400 selection:bg-emerald-500/30 resize-none outline-none overflow-hidden block"
          />
        </div>
      </div>
    </div>
  );
}
