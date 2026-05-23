/**
 * Keep public/versions.json identical to root versions.json (Weave release workflow requirement).
 */
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ROOT_VERSIONS = path.join(PROJECT_ROOT, "versions.json");
const PUBLIC_VERSIONS = path.join(PROJECT_ROOT, "public", "versions.json");

function main() {
	if (!fs.existsSync(ROOT_VERSIONS)) {
		console.error("[sync-public-versions] versions.json not found");
		process.exit(1);
	}

	fs.mkdirSync(path.dirname(PUBLIC_VERSIONS), { recursive: true });
	const versions = JSON.parse(fs.readFileSync(ROOT_VERSIONS, "utf8"));
	fs.writeFileSync(PUBLIC_VERSIONS, `${JSON.stringify(versions, null, 2)}\n`);
	console.log("[sync-public-versions] public/versions.json synchronized with versions.json");
}

main();
