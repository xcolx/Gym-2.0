/**
 * `String(format: "%.<decimals>f")`: like toFixed, but an exact tie is rounded to the even digit like printf (toFixed
 * rounds it away from zero), and -0 keeps its sign
 */
export function printfFixed(value: number, decimals: number): string {
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  const magnitude = Math.abs(value);
  // A tie at `decimals` is a value with exactly decimals + 1 decimal digits, the last one a 5: j / 2^(decimals + 1)
  // with an odd j. Multiplying by a power of two is exact.
  const scaled = magnitude * 2 ** (decimals + 1);
  if (!Number.isInteger(scaled) || scaled % 2 !== 1 || !Number.isSafeInteger(scaled)) {
    const text = magnitude.toFixed(decimals);
    return sign + text;
  }
  // magnitude * 10^decimals = j * 5^decimals / 2, between lower and lower + 1
  const doubled = BigInt(scaled) * BigInt(5) ** BigInt(decimals);
  const lower = (doubled - BigInt(1)) / BigInt(2);
  const rounded = lower % BigInt(2) === BigInt(0) ? lower : lower + BigInt(1);
  const digits = rounded.toString().padStart(decimals + 1, "0");
  const text = decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
  return sign + text;
}
