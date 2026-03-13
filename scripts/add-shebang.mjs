import fs from "node:fs/promises";

const shebang = "#!/usr/bin/env node\n";

for (const filePath of process.argv.slice(2)) {
  const content = await fs.readFile(filePath, "utf8");
  if (!content.startsWith(shebang)) {
    await fs.writeFile(filePath, `${shebang}${content}`);
  }
}
