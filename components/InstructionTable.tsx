"use client";

import { useState } from "react";
import Link from "next/link";
import { INSTRUCTIONS_DATA } from "@/lib/instruction-data";

export default function InstructionTable() {
  const [archFilter, setArchFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = INSTRUCTIONS_DATA.filter((item) => {
    const matchesArch = archFilter === "all" || item.arch === archFilter;
    const matchesSearch =
      item.mnemonic.toLowerCase().includes(search.toLowerCase()) ||
      item.fullName.toLowerCase().includes(search.toLowerCase()) ||
      item.archDisplay.toLowerCase().includes(search.toLowerCase()) ||
      item.sourcePrivilege.toLowerCase().includes(search.toLowerCase()) ||
      item.targetPrivilege.toLowerCase().includes(search.toLowerCase());
    return matchesArch && matchesSearch;
  });

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
          {[
            { label: "All Architectures", value: "all" },
            { label: "x86 (32-bit)", value: "x86_32" },
            { label: "x86_64", value: "x86_64" },
            { label: "ARM64 (AArch64)", value: "arm64" },
            { label: "RISC-V", value: "riscv" },
          ].map((tab) => (
            <button
              type="button"
              key={tab.value}
              onClick={() => setArchFilter(tab.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${archFilter === tab.value
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search instruction, register, or privilege..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <table className="w-full text-left text-xs text-zinc-600 dark:text-zinc-300">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-200 uppercase font-semibold text-[11px] border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="py-3.5 px-4">Instruction</th>
              <th className="py-3.5 px-4">Architecture / CPU</th>
              <th className="py-3.5 px-4">Year (Spec / Silicon)</th>
              <th className="py-3.5 px-4">Transition Boundary</th>
              <th className="py-3.5 px-4">Hardware Mechanism</th>
              <th className="py-3.5 px-4">Return Op</th>
              <th className="py-3.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
            {filtered.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <td className="py-3 px-4">
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {item.mnemonic}
                  </div>
                  <div className="font-sans text-[11px] text-zinc-500">
                    {item.fullName}
                  </div>
                </td>
                <td className="py-3 px-4 font-sans">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300">
                    {item.archDisplay}
                  </span>
                </td>
                <td className="py-3 px-4 font-sans text-zinc-700 dark:text-zinc-300">
                  <span className="font-semibold">{item.yearIntroduced}</span>
                  {item.yearSiliconShipped !== item.yearIntroduced && (
                    <span className="text-[10px] text-zinc-500 ml-1">
                      (silicon {item.yearSiliconShipped})
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                      {item.sourcePrivilege}
                    </span>
                    <span className="text-zinc-400 font-bold">&rarr;</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                      {item.targetPrivilege}
                    </span>
                  </div>
                </td>
                <td
                  className="py-3 px-4 font-sans max-w-xs truncate text-[11px] text-zinc-600 dark:text-zinc-400"
                  title={item.hardwareMechanism}
                >
                  {item.hardwareMechanism}
                </td>
                <td className="py-3 px-4 text-emerald-700 dark:text-emerald-300 font-bold">
                  {item.returnInstruction}
                </td>
                <td className="py-3 px-4 text-right">
                  <Link
                    href={`/instructions/${item.id}`}
                    className="inline-flex items-center px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-sans font-medium transition-colors"
                  >
                    Emulate &rarr;
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
