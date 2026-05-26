// Validate every nxr kind schema against the meta-schema with ajv (draft 2020-12).
// Run: npm run validate:schemas
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "..", "schema");
const read = (f) => JSON.parse(readFileSync(join(schemaDir, f), "utf8"));

const meta = read("nxr.meta.schema.json");
const registry = read("registry.json").registry;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(meta);

let failures = 0;
for (const [kind, file] of Object.entries(registry)) {
  const doc = read(file);
  if (validate(doc)) {
    console.log(`PASS ${kind.padEnd(22)} ${file}`);
  } else {
    failures++;
    console.error(`FAIL ${kind.padEnd(22)} ${file}`);
    for (const e of validate.errors) {
      console.error(`     ${e.instancePath || "/"}: ${e.message}`);
    }
  }
}

console.log(
  failures === 0
    ? `\n✓ all ${Object.keys(registry).length} kind schemas conform to nxr.meta.schema.json`
    : `\n✗ ${failures} schema(s) failed meta-schema validation`,
);
process.exit(failures ? 1 : 0);
