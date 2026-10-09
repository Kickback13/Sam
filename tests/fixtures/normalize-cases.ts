/** Shared cases: unit tests check TS; tests/rls/normalize-parity.test.ts checks SQL returns the same. */
export const EMAIL_CASES: [string, string | null][] = [
  ["Ana@Example.COM", "ana@example.com"],
  ["  ana@example.com  ", "ana@example.com"],
  ["mailto:ana@example.com", "ana@example.com"],
  ["ana@example", null],
  ["not-an-email", null],
  ["", null],
  ["a b@example.com", null],
];

export const PHONE_CASES: [string, string | null][] = [
  ["(619) 555-0100", "+16195550100"],
  ["619-555-0100", "+16195550100"],
  ["6195550100", "+16195550100"],
  ["+1 619 555 0100", "+16195550100"],
  ["1-619-555-0100", "+16195550100"],
  ["619.555.0100 ext 23", "+16195550100"],
  ["(619) 555-0100 x5", "+16195550100"],
  ["+44 20 7946 0958", "+442079460958"],
  ["5550100", "5550100"],
  ["12", null],
  ["", null],
  ["call me", null],
];
