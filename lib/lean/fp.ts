/**
 * Lean Option type: Represents optional values without undefined/null leakage.
 */
export type Option<T> =
  | { readonly tag: "some"; readonly value: T }
  | { readonly tag: "none" };

export const Option = {
  some: <T>(value: T): Option<T> => ({ tag: "some", value }),
  none: <T = never>(): Option<T> => ({ tag: "none" }),
  map: <T, U>(opt: Option<T>, fn: (val: T) => U): Option<U> =>
    opt.tag === "some" ? Option.some(fn(opt.value)) : Option.none(),
  unwrapOr: <T>(opt: Option<T>, fallback: T): T =>
    opt.tag === "some" ? opt.value : fallback,
};

/**
 * Lean Except type: Represents computations that may fail with diagnostic ε.
 */
export type Except<E, T> =
  | { readonly tag: "ok"; readonly value: T }
  | { readonly tag: "error"; readonly error: E };

export const Except = {
  ok: <E = never, T = void>(value: T): Except<E, T> => ({ tag: "ok", value }),
  error: <E, T = never>(error: E): Except<E, T> => ({ tag: "error", error }),
  map: <E, T, U>(res: Except<E, T>, fn: (val: T) => U): Except<E, U> =>
    res.tag === "ok" ? Except.ok(fn(res.value)) : res,
  flatMap: <E, T, U>(
    res: Except<E, T>,
    fn: (val: T) => Except<E, U>,
  ): Except<E, U> => (res.tag === "ok" ? fn(res.value) : res),
};

/**
 * Lean BitVec w: A formal, bounded bitvector of width W (8, 16, 32, or 64).
 * Enforces modular wrap-around arithmetic and eliminates negative hex strings.
 */
export class BitVec<W extends 8 | 16 | 32 | 64> {
  readonly width: W;
  readonly val: bigint;

  private constructor(width: W, val: bigint) {
    this.width = width;
    this.val = BigInt.asUintN(width, val);
  }

  static of<W extends 8 | 16 | 32 | 64>(
    width: W,
    val: bigint | number,
  ): BitVec<W> {
    return new BitVec(width, BigInt(val));
  }

  static zero<W extends 8 | 16 | 32 | 64>(width: W): BitVec<W> {
    return new BitVec(width, 0n);
  }

  add(other: BitVec<W>): BitVec<W> {
    return new BitVec(this.width, this.val + other.val);
  }

  sub(other: BitVec<W>): BitVec<W> {
    return new BitVec(this.width, this.val - other.val);
  }

  xor(other: BitVec<W>): BitVec<W> {
    return new BitVec(this.width, this.val ^ other.val);
  }

  and(other: BitVec<W>): BitVec<W> {
    return new BitVec(this.width, this.val & other.val);
  }

  or(other: BitVec<W>): BitVec<W> {
    return new BitVec(this.width, this.val | other.val);
  }

  isZero(): boolean {
    return this.val === 0n;
  }

  /** Zero-extend to 64-bit vector */
  zext64(): BitVec<64> {
    return BitVec.of(64, this.val);
  }

  /** Truncate to lower 32-bit vector */
  trunc32(): BitVec<32> {
    return BitVec.of(32, this.val);
  }

  toHex(pad = true): string {
    const hex = this.val.toString(16);
    if (!pad) return `0x${hex}`;
    const targetLength = this.width / 4;
    return `0x${hex.padStart(targetLength, "0")}`;
  }

  toDec(): string {
    return this.val.toString(10);
  }
}

/** Exhaustive pattern match enforcer */
export function assertExhaustive(x: never): never {
  throw new Error(
    `Non-exhaustive pattern match on variant: ${JSON.stringify(x)}`,
  );
}
