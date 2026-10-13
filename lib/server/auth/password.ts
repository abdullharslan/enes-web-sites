import { hash, verify } from "@node-rs/argon2";

export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;

export type PasswordProblem = "tooShort" | "tooLong" | "blank";

/** Length-based policy (NIST SP 800-63B): long passphrases beat composition rules. */
export function passwordProblems(password: string): PasswordProblem[] {
  if (password.trim() === "") return ["blank"];
  if (password.length < PASSWORD_MIN_LENGTH) return ["tooShort"];
  if (password.length > PASSWORD_MAX_LENGTH) return ["tooLong"];
  return [];
}

// argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
