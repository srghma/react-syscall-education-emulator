import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-mono font-bold flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
              CPU
            </div>
            <div>
              <span className="font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
                SyscallEDU
              </span>
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
                Emulator & Debugger
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link
            href="/"
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors"
          >
            Instruction Matrix
          </Link>
          <Link
            href="/playground"
            className="px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
          >
            Interactive Playground
          </Link>
        </nav>
      </div>
    </header>
  );
}
