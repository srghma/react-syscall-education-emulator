import type { PureMemory } from "@/lib/lean/memory";

interface MemoryHexdumpProps {
  memory: PureMemory;
  symbols: ReadonlyMap<string, bigint>;
}

interface ByteCell {
  addrStr: string;
  hex: string;
  val: number;
}

interface HexRow {
  addr: bigint;
  bytes: ByteCell[];
  ascii: string;
  symbolName?: string;
}

export default function MemoryHexdump({ memory, symbols }: MemoryHexdumpProps) {
  const baseAddr = 0x00402000n;
  const numRows = 4;
  const bytesPerRow = 16;
  const rows: HexRow[] = [];

  const symReverse = new Map<bigint, string>();
  for (const [name, addr] of symbols.entries()) {
    symReverse.set(addr, name);
  }

  for (let r = 0; r < numRows; r++) {
    const rowAddr = baseAddr + BigInt(r * bytesPerRow);
    const bytes: ByteCell[] = [];
    let ascii = "";

    for (let c = 0; c < bytesPerRow; c++) {
      const curAddr = rowAddr + BigInt(c);
      const b = memory.readByte(curAddr);
      bytes.push({
        addrStr: curAddr.toString(16),
        hex: b.toString(16).padStart(2, "0"),
        val: b,
      });
      ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
    }

    rows.push({
      addr: rowAddr,
      bytes,
      ascii,
      symbolName: symReverse.get(rowAddr),
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm font-mono text-xs">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">
        <div>
          <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider font-sans">
            Guest Memory Inspector (.data segment)
          </h4>
          <span className="text-[10px] text-zinc-500 font-sans">
            Byte-level ASCII buffer dereferenced by sys_write pointers
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          Base: 0x00402000
        </span>
      </div>

      <div className="space-y-1.5 text-[11px] overflow-x-auto">
        {rows.map((row) => (
          <div
            key={row.addr.toString()}
            className="flex items-center gap-3 py-1 px-2 rounded bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-[120px]">
              <span className="text-zinc-400 font-bold">
                0x{row.addr.toString(16).padStart(8, "0")}
              </span>
              {row.symbolName && (
                <span className="px-1 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-sans font-bold">
                  {row.symbolName}:
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200">
              {row.bytes.map((b) => (
                <span
                  key={b.addrStr}
                  className={
                    b.val !== 0
                      ? "text-emerald-600 dark:text-emerald-400 font-bold"
                      : "text-zinc-400 dark:text-zinc-600"
                  }
                >
                  {b.hex}
                </span>
              ))}
            </div>

            <span className="text-amber-700 dark:text-amber-400 border-l border-zinc-200 dark:border-zinc-700 pl-3">
              |{row.ascii}|
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
