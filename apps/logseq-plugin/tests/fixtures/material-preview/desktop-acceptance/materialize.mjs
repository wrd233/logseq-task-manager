import process from "node:process";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve, sep} from "node:path";
import {createHash} from "node:crypto";
import {URL} from "node:url";

if (!process.argv[2]) throw new Error("Supply a new empty output directory for synthetic preview fixtures.");
const output = resolve(process.argv[2]);
// mkdir is intentionally non-recursive: an existing location is never reused.
await mkdir(output);
const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8"));
for (const sample of manifest.samples) {
  const destination = resolve(output, sample.relativePath);
  if (!destination.startsWith(output + sep)) throw new Error("Fixture path escaped its output directory.");
  const bytes = await readFile(new URL(sample.storedFile, import.meta.url));
  if (createHash("sha256").update(bytes).digest("hex") !== sample.sha256) throw new Error("Fixture bytes do not match their manifest.");
  await mkdir(dirname(destination), {recursive: true});
  await writeFile(destination, bytes, {flag: "wx"});
}
process.stdout.write(JSON.stringify({output, samples: manifest.samples.length, originalBytesVerified: true}) + "\n");
