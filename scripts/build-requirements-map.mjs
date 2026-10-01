import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";

const repo = fileURLToPath(new URL("../", import.meta.url));
const data = JSON.parse(await readFile(new URL("../docs/integration/requirements.json", import.meta.url), "utf8"));
const ids = new Set();
async function validate(node) {
  if (ids.has(node.id)) throw new Error(`Duplicate requirement: ${node.id}`);
  ids.add(node.id);
  if (!["implemented", "partial", "planned", "excluded"].includes(node.status)) throw new Error(`Invalid status: ${node.id}`);
  if (!["default", "conditional", "off", "unavailable", "mixed"].includes(node.enabled)) throw new Error(`Invalid enablement: ${node.id}`);
  if (!node.children && node.status === "implemented" && !node.implementation?.length) throw new Error(`Missing implementation: ${node.id}`);
  for (const path of node.implementation ?? []) await access(`${repo}${path}`);
  for (const child of node.children ?? []) await validate(child);
}
await validate(data.tree);
const template = await readFile(new URL("../docs/integration/requirements.template.html", import.meta.url), "utf8");
const output = template.replace("__REQUIREMENTS_DATA__", JSON.stringify(data).replaceAll("<", "\\u003c"));
await writeFile(new URL("../docs/integration/requirements.html", import.meta.url), output);
console.log(`Built standalone requirements map: ${ids.size} nodes.`);
