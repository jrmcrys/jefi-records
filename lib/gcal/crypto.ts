import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/* Refresh tokens are stored encrypted. The key lives only in the server
   environment (GOOGLE_TOKEN_KEY, 32 random bytes as base64), so the database
   and the browser only ever see ciphertext. */

function key(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_KEY;
  if (!raw) throw new Error("GOOGLE_TOKEN_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("GOOGLE_TOKEN_KEY must be 32 bytes, base64 encoded");
  }
  return buf;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(".");
}

export function decryptToken(stored: string): string {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !body) {
    throw new Error("Unrecognized token format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function tokenKeyConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
