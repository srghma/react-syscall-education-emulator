import { BitVec } from "./fp";

/**
 * Pure Functional Sparse Memory Map: Addr (bigint) -> Byte (number).
 */
export class PureMemory {
  private readonly storage: ReadonlyMap<string, number>;

  constructor(storage?: ReadonlyMap<string, number>) {
    this.storage = storage ?? new Map();
  }

  readByte(addr: bigint): number {
    return this.storage.get(addr.toString()) ?? 0;
  }

  writeByte(addr: bigint, byte: number): PureMemory {
    const next = new Map(this.storage);
    next.set(addr.toString(), byte & 0xff);
    return new PureMemory(next);
  }

  writeBytes(startAddr: bigint, bytes: Uint8Array): PureMemory {
    const next = new Map(this.storage);
    for (let i = 0; i < bytes.length; i++) {
      next.set((startAddr + BigInt(i)).toString(), bytes[i]);
    }
    return new PureMemory(next);
  }

  writeAscii(startAddr: bigint, text: string): PureMemory {
    const encoder = new TextEncoder();
    return this.writeBytes(startAddr, encoder.encode(text));
  }

  readAscii(startAddr: bigint, length: number): string {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = this.readByte(startAddr + BigInt(i));
    }
    return new TextDecoder().decode(bytes);
  }

  readWord64(addr: bigint): BitVec<64> {
    let raw = 0n;
    for (let i = 0; i < 8; i++) {
      const b = BigInt(this.readByte(addr + BigInt(i)));
      raw |= b << BigInt(i * 8);
    }
    return BitVec.of(64, raw);
  }

  writeWord64(addr: bigint, val: BitVec<64>): PureMemory {
    let mem: PureMemory = this;
    for (let i = 0; i < 8; i++) {
      const byte = Number((val.val >> BigInt(i * 8)) & 0xffn);
      mem = mem.writeByte(addr + BigInt(i), byte);
    }
    return mem;
  }
}
