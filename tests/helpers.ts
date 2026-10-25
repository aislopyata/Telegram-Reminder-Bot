import { randomUUID } from "node:crypto";

export function nextToken(): string {
  return randomUUID().replace(/-/g, "").slice(0, 24);
}
