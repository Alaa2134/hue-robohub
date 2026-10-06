import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { ...OPTIONS, algorithm: 2 /* Argon2id */ });
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Burn equivalent CPU when the account doesn't exist, so response timing doesn't leak which emails exist. */
export async function verifyDummy(password: string): Promise<void> {
  dummy ??= hashPassword("dummy-password-for-timing-equalisation");
  await verifyPassword(await dummy, password);
}
