import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = [
  ["private-key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["credential", /\b(?:gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|glpat-[\w-]{20,}|sk-[\w-]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[\w-]{10,})\b/],
  ["personal-path", /(?:\/Users\/|\/home\/)[^\s/"'`]+\//],
  ["personal-path", /[A-Z]:\\(?:\\)?Users\\(?:\\)?[^\s\\"'`]+/],
  ["email", /\b[\w.+-]+@(?!example\.(?:com|org|net)\b)[\w.-]+\.[a-z]{2,}\b/i],
  ["embedded-secret", /\b(?:api[_-]?key|(?:(?:access|refresh|auth|api)[_-]?)?token|client[_-]?secret|password|secret|authorization)\s*["']?\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i],
  ["private-endpoint", /https?:\/\/(?:[^\s/"'`]+@|(?:localhost|[\w.-]+\.(?:internal|corp|lan|local))(?=[:/\s"'`])|(?:10|127)\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/i],
];

// Return only locations and rule IDs. Never print matching values or source lines.
export function scanSource(source, file = "source") {
  return source.split(/\r?\n/).flatMap((line, index) => rules.filter(([, pattern]) => pattern.test(line))
    .map(([rule]) => ({ file, line: index + 1, rule })));
}

export function scanDirectory(root) {
  const findings = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git"].includes(entry.name)) continue;
      const target = path.join(directory, entry.name);
      const file = path.relative(root, target);
      if (entry.isSymbolicLink()) { findings.push({ file, line: 1, rule: "linked-private-file" }); continue; }
      if (entry.isDirectory()) { visit(target); continue; }
      if (/^(?:\.env(?:\..*)?|credentials\.json)$|\.(?:pem|p12|pfx|key)$/i.test(entry.name)) {
        findings.push({ file, line: 1, rule: "private-file" }); continue;
      }
      const content = fs.readFileSync(target);
      if (!content.includes(0)) findings.push(...scanSource(content.toString("utf8"), file));
    }
  }
  visit(root);
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const roots = args.filter(arg => arg !== "--installed");
  if (!roots.length) roots.push(path.join(repository, "extensions"));
  if (args.includes("--installed")) roots.push(path.join(os.homedir(), ".betterbar/extensions"));
  let count = 0;
  for (const [index, root] of roots.entries()) {
    if (!fs.existsSync(root)) { console.error(`Extension source ${index + 1}: directory unavailable.`); count++; continue; }
    for (const finding of scanDirectory(root)) {
      console.error(`Extension source ${index + 1}: ${finding.file}:${finding.line} [${finding.rule}]`);
      count++;
    }
  }
  console.log(count ? `Extension privacy audit: ${count} finding(s); values withheld.` : "Extension privacy audit passed.");
  process.exitCode = count ? 1 : 0;
}
