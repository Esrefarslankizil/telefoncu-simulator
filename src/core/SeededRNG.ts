const ZERO_STATE_REPLACEMENT = 0x6d2b79f5;
const UINT32_RANGE = 0x1_0000_0000;

/** Xorshift32 generator with an explicitly serializable 32-bit state. */
export class SeededRNG {
  private state: number;

  public constructor(seed: number) {
    this.state = SeededRNG.normalizeState(seed);
  }

  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = SeededRNG.normalizeState(state);
  }

  public nextUint32(): number {
    let nextState = this.state;
    nextState ^= nextState << 13;
    nextState ^= nextState >>> 17;
    nextState ^= nextState << 5;
    this.state = nextState >>> 0;
    return this.state;
  }

  /** Returns a value in the half-open interval [0, 1). */
  public nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Returns a uniformly distributed integer in the inclusive [min, max] range. */
  public nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError("SeededRNG.nextInt expects safe integers where min <= max.");
    }

    const range = max - min + 1;

    if (!Number.isSafeInteger(range) || range <= 0) {
      throw new RangeError("SeededRNG.nextInt range must be a positive safe integer.");
    }

    if (range > UINT32_RANGE) {
      return min + Math.floor(this.nextFloat() * range);
    }

    const limit = UINT32_RANGE - (UINT32_RANGE % range);
    let value = this.nextUint32();

    while (value >= limit) {
      value = this.nextUint32();
    }

    return min + (value % range);
  }

  public nextBoolean(probability = 0.5): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError("SeededRNG.nextBoolean probability must be between 0 and 1.");
    }

    return this.nextFloat() < probability;
  }

  private static normalizeState(state: number): number {
    if (!Number.isSafeInteger(state) || state < 0 || state > 0xffff_ffff) {
      throw new RangeError("SeededRNG state must be an unsigned 32-bit integer.");
    }

    return state === 0 ? ZERO_STATE_REPLACEMENT : state >>> 0;
  }
}
