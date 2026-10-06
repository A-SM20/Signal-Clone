// Regenerates src/lib/api/schema.d.ts from the FastAPI OpenAPI schema.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const backend = join(import.meta.dirname, "..", "..", "backend");
const python = [join(backend, ".venv", "Scripts", "python.exe"), join(backend, ".venv", "bin", "python")].find(existsSync) ?? "python";
const json = execFileSync(python, ["-m", "app.openapi_dump"], { cwd: backend, encoding: "utf8" });
writeFileSync(join(import.meta.dirname, "..", "openapi.json"), json);
execFileSync("npx", ["openapi-typescript", "openapi.json", "-o", "src/lib/api/schema.d.ts"], {
  cwd: join(import.meta.dirname, ".."),
  stdio: "inherit",
  shell: true,
});
