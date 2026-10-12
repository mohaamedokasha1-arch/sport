#!/usr/bin/env node
/**
 * Mirrors `config/pipeline/endpoints.yml` into `config/pipeline/endpoints.json`.
 *
 *   npm run pipeline:config:sync    # regenerate the mirror
 *   npm run pipeline:config:check   # fail when the mirror is stale (CI)
 *
 * The YAML file is the source of truth; the JSON mirror is what a serverless
 * bundle can always import. Shipping without a YAML dependency is a feature:
 * `lib/pipeline/yaml-lite.ts` parses the subset the registry uses and refuses
 * anything it does not fully understand.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseYamlMap, YamlLiteError } from "../lib/pipeline/yaml-lite";

const ROOT = resolve(process.cwd());
const YAML_FILE = resolve(ROOT, "config/pipeline/endpoints.yml");
const JSON_FILE = resolve(ROOT, "config/pipeline/endpoints.json");

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = stable((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function main(): number {
  const check = process.argv.includes("--check");
  let source: string;
  try {
    source = readFileSync(YAML_FILE, "utf8");
  } catch (error) {
    console.error(`✗ cannot read ${YAML_FILE}: ${(error as Error).message}`);
    return 2;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYamlMap(source) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof YamlLiteError ? error.message : String(error);
    console.error(`✗ endpoints.yml is not valid YAML-lite: ${detail}`);
    return 2;
  }

  if (!parsed.sources || !parsed.competitions || !parsed.jobs) {
    console.error("✗ endpoints.yml is missing one of: sources, competitions, jobs");
    return 2;
  }

  const ordered = {
    version: parsed.version,
    priority: parsed.priority,
    defaults: parsed.defaults,
    competitions: parsed.competitions,
    sources: parsed.sources,
    jobs: parsed.jobs,
  };
  const rendered = `${JSON.stringify(stable(ordered), null, 2)}\n`;

  let current: string | null = null;
  try {
    current = readFileSync(JSON_FILE, "utf8");
  } catch {
    current = null;
  }

  if (check) {
    if (current === null) {
      console.error("✗ config/pipeline/endpoints.json is missing — run npm run pipeline:config:sync");
      return 1;
    }
    if (current !== rendered) {
      console.error("✗ config/pipeline/endpoints.json is stale — run npm run pipeline:config:sync");
      return 1;
    }
    console.log("✓ endpoints.json matches endpoints.yml");
    return 0;
  }

  if (current === rendered) {
    console.log("✓ endpoints.json already up to date");
    return 0;
  }
  writeFileSync(JSON_FILE, rendered, "utf8");
  console.log(`✓ wrote config/pipeline/endpoints.json (${rendered.length} bytes) from endpoints.yml`);
  return 0;
}

process.exit(main());
