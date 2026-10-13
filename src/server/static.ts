import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

// Same-origin compiled visitor UI; domain API routes remain authoritative.
export function serveFrontend(app: FastifyInstance, directory: string) {
  const root = resolve(directory);
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
  };
  app.get("/*", async (request, reply) => {
    const pathname = decodeURIComponent(request.url.split("?")[0]!);
    if (pathname.startsWith("/api/") || pathname === "/api")
      return reply.code(404).send({ error: { code: "NOT_FOUND" } });
    const path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep))
      return reply.code(404).send();
    const isFile = existsSync(path) && statSync(path).isFile();
    if (!isFile && extname(path)) return reply.code(404).send();
    const asset = isFile ? path : resolve(root, "index.html");
    return reply
      .header("Cache-Control", "no-store")
      .type(types[extname(asset)] ?? "application/octet-stream")
      .send(readFileSync(asset));
  });
}
