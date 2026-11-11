"use client";

import { useRef, type UIEvent, type KeyboardEvent } from "react";
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
  "nop",
]);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightLine(line: string, arch: Arch): string {
  if (!line) return "&nbsp;";

  const commentPattern =
    arch === "arm64" ? "(?:\\/\\/).*$" : "(?:[#]|\\/\\/).*$";

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
        html += `<span class="text-emerald-400 font-extrabold bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-800/80">${escapeHtml(text)}</span>`;
      } else if (STANDARD_MNEMONICS.has(lower)) {
        html += `<span class="text-sky-400 font-bold">${escapeHtml(text)}</span>`;
      } else {
        html += `<span class="text-orange-300">${escapeHtml(text)}</span>`;
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
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-hidden shadow-sm">
      <div className="flex border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-[11px] text-zinc-400 items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-zinc-300">
          Source Program ({lines.length} lines)
        </span>
        <span className="font-sans text-[10px] text-zinc-500">
          Auto-expanding &bull; Esc to release focus
        </span>
      </div>

      <div className="relative flex overflow-x-auto">
        {/* Gutter */}
        <div className="select-none bg-zinc-900/50 text-zinc-600 dark:text-zinc-500 py-3 px-3 text-right border-r border-zinc-800 font-mono text-xs leading-6 min-w-[3.2rem]">
          {lines.map((_, i) => {
            const isActive = i === activeLineIndex && !isHalted;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are fixed by index in gutter
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

        {/* Code Canvas (Horizontal scroll enabled without soft-wrap drift) */}
        <div className="relative flex-1 min-w-[480px]">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="py-3 px-4 m-0 font-mono text-xs leading-6 whitespace-pre overflow-hidden block select-none pointer-events-none"
          >
            {lines.map((line, i) => {
              const isActive = i === activeLineIndex && !isHalted;
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: line index specifies code row
                  key={i}
                  className={`h-6 transition-colors ${
                    isActive
                      ? "bg-emerald-950/40 shadow-[inset_3px_0_0_0_#34d399]"
                      : ""
                  }`}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: Tokenized syntax highlighter
                  dangerouslySetInnerHTML={{
                    __html: highlightLine(line, arch),
                  }}
                />
              );
            })}
          </pre>

          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            wrap="off"
            aria-label="Assembly source editor"
            className="absolute inset-0 w-full h-full py-3 px-4 font-mono text-xs leading-6 whitespace-pre bg-transparent text-transparent caret-emerald-400 selection:bg-emerald-500/30 resize-none outline-none overflow-hidden block"
          />
        </div>
      </div>
    </div>
  );
}
