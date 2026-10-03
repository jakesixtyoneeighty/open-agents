import { readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../packages/agent/skills/bundled/", import.meta.url);
const output = new URL(
  "../packages/agent/skills/bundled.generated.json",
  import.meta.url,
);
const skills = [];

for (const entry of (await readdir(root, { withFileTypes: true })).sort(
  (a, b) => a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory()) continue;
  const source = await readFile(
    new URL(`${entry.name}/SKILL.md`, root),
    "utf8",
  );
  const match = source.match(
    /^---\r?\nname: ([a-z0-9-]+)\r?\ndescription: (.+)\r?\n---\r?\n([\s\S]+)$/,
  );
  if (!match || match[1] !== entry.name || !match[2] || !match[3]?.trim()) {
    throw new Error(
      `Invalid runtime skill: ${entry.name}. Use single-line name and description frontmatter.`,
    );
  }
  skills.push({
    name: match[1],
    description: match[2],
    content: match[3].trim(),
  });
}

if (skills.length === 0) throw new Error("Runtime skills bundle is empty");

if (process.argv.includes("--check")) {
  const existing: unknown = JSON.parse(await readFile(output, "utf8"));
  if (JSON.stringify(existing) !== JSON.stringify(skills)) {
    throw new Error("Runtime skills bundle is stale. Run pnpm skills:build.");
  }
  console.log(`Verified ${skills.length} bundled runtime skills.`);
} else {
  await writeFile(output, `${JSON.stringify(skills, null, 2)}\n`);
  console.log(`Bundled ${skills.length} runtime skills.`);
}
