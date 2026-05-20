#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "..");
const baselinePath = path.join(projectRoot, ".mojibake-baseline.json");
const writeBaseline = process.argv.slice(2).includes("--write-baseline");

const includeExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".cjs",
  ".mjs",
  ".svelte",
  ".css",
  ".json",
  ".md"
]);

const ignoredDirectories = new Set([
  ".git",
  ".desktop-hot-reload",
  ".mobile-hot-reload",
  "dist",
  "node_modules",
  "backup-before-migration",
  "coverage"
]);

const suspiciousSequencePattern =
  /(?:�|澶辫触|璇诲彇|娓呯悊|鍒犻櫎|鍗＄墖|鐗岀粍|缂撳瓨|閫氱煡|鏁版嵁|鍚屾|璺緞|鎵归噺|鈿狅笍|鉂|馃|妫€|缁熶竴|鍒濆|瀵煎叆|绛涢€夊櫒|鏍囩|涓婚|纭繚|鍙栨秷|鍥為€€|鎵佸钩鍖|鍒峰啓|闄嶇骇鍒|鑾峰彇|浣跨敤|鏇存柊|闂|缂|婵|鍨|濠|鐗|杩|閫|鏉)/u;

const noisyCharacterPattern = /[闂缂婵鍨濠鐗杩閫鏉欒璇鍒鈿鉂馃妫缁鏍瀵纭浣鍔]/gu;

function shouldInspectLine(line) {
  if (!line.trim()) return false;
  return /(?:\/\/|\/\*|\*|<!--|["'`])/.test(line);
}

function isSuspiciousLine(line) {
  if (!shouldInspectLine(line)) return false;
  if (suspiciousSequencePattern.test(line)) return true;

  const noisyCharacters = line.match(noisyCharacterPattern);
  return (noisyCharacters?.length ?? 0) >= 3;
}

function toProjectRelative(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
}

function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function collectFiles(root) {
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name)) continue;

      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (entry.name === path.basename(baselinePath)) continue;
      if (!includeExtensions.has(path.extname(entry.name))) continue;
      files.push(absolutePath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function scanFile(absolutePath) {
  const relativePath = toProjectRelative(absolutePath);
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  const hits = [];

  lines.forEach((line, index) => {
    if (!isSuspiciousLine(line)) return;

    hits.push({
      path: relativePath,
      line: index + 1,
      preview: line.trim().slice(0, 140),
      hash: sha1(line.trim())
    });
  });

  return hits;
}

function aggregateHits(hits) {
  const map = new Map();

  for (const hit of hits) {
    const key = `${hit.path}::${hit.hash}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (hit.line < existing.firstLine) {
        existing.firstLine = hit.line;
      }
      continue;
    }

    map.set(key, {
      path: hit.path,
      hash: hit.hash,
      count: 1,
      firstLine: hit.line,
      preview: hit.preview
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.firstLine !== b.firstLine) return a.firstLine - b.firstLine;
    return a.hash.localeCompare(b.hash);
  });
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) {
    return [];
  }

  const raw = fs.readFileSync(baselinePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

function toCountMap(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = `${entry.path}::${entry.hash}`;
    counts.set(key, (counts.get(key) ?? 0) + (entry.count ?? 1));
  }
  return counts;
}

function main() {
  const allHits = collectFiles(projectRoot).flatMap(scanFile);
  const aggregatedHits = aggregateHits(allHits);

  if (writeBaseline) {
    const baseline = {
      version: 1,
      generatedAt: new Date().toISOString(),
      entries: aggregatedHits
    };
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote baseline with ${aggregatedHits.length} entries to ${path.basename(baselinePath)}.`);
    return;
  }

  const baselineEntries = loadBaseline();
  const baselineCounts = toCountMap(baselineEntries);
  const newHits = [];

  for (const entry of aggregatedHits) {
    const key = `${entry.path}::${entry.hash}`;
    const baselineCount = baselineCounts.get(key) ?? 0;
    if (entry.count <= baselineCount) continue;

    newHits.push({
      path: entry.path,
      firstLine: entry.firstLine,
      count: entry.count - baselineCount,
      preview: entry.preview
    });
  }

  if (newHits.length === 0) {
    console.log(`No new suspicious mojibake patterns detected. Baseline entries: ${baselineEntries.length}.`);
    return;
  }

  console.error("Detected suspicious mojibake patterns not covered by the current baseline:");
  for (const hit of newHits) {
    console.error(`- ${hit.path}:${hit.firstLine} (+${hit.count}) ${hit.preview}`);
  }
  process.exitCode = 1;
}

main();
