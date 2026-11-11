export type Option<T> =
  | { readonly tag: "some"; readonly value: T }
  | { readonly tag: "none" };

export const Option = {
  some: <T>(value: T): Option<T> => ({ tag: "some", value }),
  none: <T = never>(): Option<T> => ({ tag: "none" }),
};

export type Except<E, T> =
  | { readonly tag: "ok"; readonly value: T }
  | { readonly tag: "error"; readonly error: E };

export const Except = {
  ok: <E = never, T = void>(value: T): Except<E, T> => ({ tag: "ok", value }),
  error: <E, T = never>(error: E): Except<E, T> => ({ tag: "error", error }),
};

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

  signBit(): boolean {
    const shift = BigInt(this.width - 1);
    return ((this.val >> shift) & 1n) === 1n;
  }

  zext64(): BitVec<64> {
    return BitVec.of(64, this.val);
  }

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

export function assertExhaustive(x: never): never {
  throw new Error(`Non-exhaustive match: ${JSON.stringify(x)}`);
}
