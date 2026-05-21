const fs = require("fs");
const path = require("path");

const root = process.cwd();
const failures = [];
const notes = [];

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
}

function readText(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function walkFiles(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) {
    return acc;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, acc);
      continue;
    }

    if (predicate(fullPath)) {
      acc.push(fullPath);
    }
  }

  return acc;
}

function requireFile(relPath) {
  if (!fs.existsSync(path.join(root, relPath))) {
    failures.push(`Missing required file: ${relPath}`);
  }
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

requireFile("README.md");
requireFile("LICENSE");
requireFile("manifest.json");
requireFile("package.json");
requireFile("versions.json");
requireFile("public/versions.json");
requireFile(".github/workflows/release.yml");

if (failures.length === 0) {
  const manifest = readJson("manifest.json");
  const pkg = readJson("package.json");
  const versions = readJson("versions.json");
  const publicVersions = readJson("public/versions.json");
  const workflow = readText(".github/workflows/release.yml");
  const sourceFiles = walkFiles(
    path.join(root, "src"),
    (fullPath) => /\.(ts|svelte)$/.test(fullPath) && !/__tests__|\.test\.|\.spec\./.test(fullPath)
  );

  expect(typeof manifest.id === "string" && manifest.id.length > 0, "manifest.json missing id");
  expect(typeof manifest.name === "string" && manifest.name.length > 0, "manifest.json missing name");
  expect(typeof manifest.version === "string" && manifest.version.length > 0, "manifest.json missing version");
  expect(typeof manifest.minAppVersion === "string" && manifest.minAppVersion.length > 0, "manifest.json missing minAppVersion");
  expect(typeof manifest.description === "string" && manifest.description.length > 0, "manifest.json missing description");

  const manifestDescription = String(manifest.description || "");
  const packageDescription = String(pkg.description || "");
  const obsidianWordPattern = /\bobsidian\b/i;

  expect(
    !obsidianWordPattern.test(manifestDescription),
    'manifest.json description must not include the word "Obsidian" (community plugin validation bot rule)',
  );

  if (packageDescription.length > 0) {
    expect(
      !obsidianWordPattern.test(packageDescription),
      'package.json description should stay aligned with manifest.json and must not include the word "Obsidian"',
    );
  }

  const normalizeDescription = (value) => value.replace(/\.\s*$/, "").trim();
  if (packageDescription.length > 0) {
    expect(
      normalizeDescription(manifestDescription) === normalizeDescription(packageDescription),
      "package.json description should match manifest.json description (ignoring trailing period)",
    );
  }

  expect(pkg.version === manifest.version, `package.json version (${pkg.version}) does not match manifest.json (${manifest.version})`);
  expect(versions[manifest.version] != null, `versions.json missing current version ${manifest.version}`);
  expect(publicVersions[manifest.version] != null, `public/versions.json missing current version ${manifest.version}`);
  expect(JSON.stringify(versions) === JSON.stringify(publicVersions), "versions.json and public/versions.json are not synchronized");

  expect(/attestations:\s*write/.test(workflow), "release.yml missing attestations: write permission");
  expect(/id-token:\s*write/.test(workflow), "release.yml missing id-token: write permission");

  const requiredUploadPaths = ["dist/main.js", "dist/manifest.json", "dist/styles.css"];
  for (const relPath of requiredUploadPaths) {
    expect(workflow.includes(relPath), `release.yml missing release asset upload: ${relPath}`);
  }

  const requiredAttestations = ["subject-path: dist/main.js", "subject-path: dist/manifest.json", "subject-path: dist/styles.css"];
  for (const marker of requiredAttestations) {
    expect(workflow.includes(marker), `release.yml missing attestation for ${marker.replace("subject-path: ", "")}`);
  }

  const forbiddenReleaseAssets = ["dist/versions.json", "dist/README.md", "dist/sql-wasm.wasm"];
  for (const relPath of forbiddenReleaseAssets) {
    expect(!workflow.includes(relPath), `release.yml should not upload extra release asset: ${relPath}`);
  }

  const distDir = path.join(root, "dist");
  if (fs.existsSync(distDir)) {
    const distEntries = fs.readdirSync(distDir);
    const recommendedReleaseOnly = ["main.js", "manifest.json", "styles.css"];
    const extraEntries = distEntries.filter((entry) => !recommendedReleaseOnly.includes(entry));
    if (extraEntries.length > 0) {
      notes.push(`dist contains extra local build artifacts not meant for GitHub release assets: ${extraEntries.join(", ")}`);
    }
  } else {
    notes.push("dist/ does not exist locally yet; build before doing a final release smoke check.");
  }

  const readme = readText("README.md");
  if (!/README\.zh-CN\.md/.test(readme)) {
    notes.push("README.md does not link the Chinese companion README at the top.");
  }

  const sourceMatches = {
    clipboardApis: [],
    browserStorageApis: [],
    vaultEnumerationApis: [],
  };

  for (const fullPath of sourceFiles) {
    const relPath = path.relative(root, fullPath).replace(/\\/g, "/");
    const content = fs.readFileSync(fullPath, "utf8");

    if (/navigator\.clipboard/.test(content)) {
      sourceMatches.clipboardApis.push(relPath);
    }
    if (/window\.localStorage|localStorage\.(getItem|setItem|removeItem)|sessionStorage\./.test(content)) {
      sourceMatches.browserStorageApis.push(relPath);
    }
    if (/\.(getMarkdownFiles|getFiles)\(/.test(content)) {
      sourceMatches.vaultEnumerationApis.push(relPath);
    }
  }

  if (sourceMatches.clipboardApis.length > 0) {
    notes.push(`runtime source still references navigator.clipboard: ${sourceMatches.clipboardApis.join(", ")}`);
  }

  if (sourceMatches.browserStorageApis.length > 0) {
    notes.push(`runtime source still references browser local/session storage: ${sourceMatches.browserStorageApis.join(", ")}`);
  }

  if (sourceMatches.vaultEnumerationApis.length > 0) {
    notes.push(`runtime source still contains vault enumeration APIs to review: ${sourceMatches.vaultEnumerationApis.join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error("Obsidian release audit failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (notes.length > 0) {
    console.error("\nNotes:");
    for (const note of notes) {
      console.error(`- ${note}`);
    }
  }
  process.exit(1);
}

console.log("Obsidian release audit passed.");
if (notes.length > 0) {
  console.log("\nNotes:");
  for (const note of notes) {
    console.log(`- ${note}`);
  }
}
