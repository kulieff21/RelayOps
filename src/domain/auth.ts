import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { Store } from "../db/database.js";
import {
  BusinessError,
  type Actor,
  type Locale,
  type Role,
  loginInput,
} from "../shared/contracts.js";

export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verify(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash) return false;
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
}
export class Auth {
  constructor(
    private store: Store,
    private wallTime = () => Date.now(),
  ) {}
  actor(accountId: string): Actor {
    const account = this.store.one<{ id: string; locale: Locale }>(
      "SELECT id,locale FROM accounts WHERE id=?",
      accountId,
    );
    if (!account) throw new BusinessError("UNAUTHORIZED", 401);
    return {
      ...account,
      roles: this.store
        .all<{ role: Role }>(
          "SELECT role FROM roles WHERE account_id=?",
          accountId,
        )
        .map((row) => row.role),
    };
  }
  login(input: unknown) {
    const { email, password } = loginInput.parse(input);
    const account = this.store.one<{ id: string; password_hash: string }>(
      "SELECT id,password_hash FROM accounts WHERE email=?",
      email.toLowerCase(),
    );
    // Do equivalent expensive work for an unknown account.
    const fallback = hashPassword("invalid", "relayops-no-account");
    if (!verify(password, account?.password_hash ?? fallback) || !account)
      throw new BusinessError("INVALID_CREDENTIALS", 401);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.wallTime() + 8 * 3600000).toISOString();
    this.store.run(
      "DELETE FROM sessions WHERE expires_at<=?",
      new Date(this.wallTime()).toISOString(),
    );
    this.store.run(
      "INSERT INTO sessions VALUES (?,?,?)",
      digest(token),
      account.id,
      expiresAt,
    );
    return { token, expiresAt, account: this.actor(account.id) };
  }
  authenticate(token: string | undefined) {
    if (!token) throw new BusinessError("UNAUTHORIZED", 401);
    const session = this.store.one<{ account_id: string; expires_at: string }>(
      "SELECT account_id,expires_at FROM sessions WHERE token_hash=?",
      digest(token),
    );
    if (
      !session ||
      session.expires_at <= new Date(this.wallTime()).toISOString()
    )
      throw new BusinessError("UNAUTHORIZED", 401);
    return this.actor(session.account_id);
  }
  logout(token: string) {
    this.store.run("DELETE FROM sessions WHERE token_hash=?", digest(token));
  }
}
