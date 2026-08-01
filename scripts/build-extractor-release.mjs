#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawVersion = process.argv[2] || "v1.1.0";
const version = rawVersion.startsWith("v") ? rawVersion : `v${rawVersion}`;
if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${rawVersion}`);

const stagingRoot = resolve(root, ".release-staging", version);
const releaseRoot = resolve(root, "release");
if (!stagingRoot.startsWith(resolve(root, ".release-staging"))) throw new Error("Staging path escaped the repository.");
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingRoot, { recursive: true });
mkdirSync(releaseRoot, { recursive: true });

const archiveVersion = version.slice(1);
const windowsName = `taiwu-martial-extractor-windows-v${archiveVersion}`;
const linuxName = `taiwu-martial-extractor-linux-v${archiveVersion}`;
const windowsStage = join(stagingRoot, windowsName);
const linuxStage = join(stagingRoot, linuxName);
mkdirSync(windowsStage, { recursive: true });
mkdirSync(linuxStage, { recursive: true });

const extractorFiles = ["code-ir.mjs", "embed-portable-assets.mjs", "extract-ui-assets.py", "extract.mjs"];
function copyExtractor(destination) {
  const target = join(destination, "extractor");
  mkdirSync(target, { recursive: true });
  for (const file of extractorFiles) cpSync(join(root, "extractor", file), join(target, file));
}

for (const file of ["README.txt", "태오회권_무공추출기.bat", "find-taiwu-game.ps1", "run-extractor.ps1"]) {
  cpSync(join(root, "windows-extractor", file), join(windowsStage, file));
}
for (const file of ["README.md", "find-taiwu-game.sh", "taiwu-martial-extractor.sh"]) {
  cpSync(join(root, "linux-extractor", file), join(linuxStage, file));
}
copyExtractor(windowsStage);
copyExtractor(linuxStage);

function normalizeText(file, eol, withBom = false) {
  const original = readFileSync(file);
  const text = original.toString("utf8").replace(/^\ufeff/, "").replace(/\r?\n/g, eol);
  const encoded = Buffer.from(text, "utf8");
  writeFileSync(file, withBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded]) : encoded);
}

normalizeText(join(windowsStage, "태오회권_무공추출기.bat"), "\r\n");
normalizeText(join(windowsStage, "README.txt"), "\r\n");
normalizeText(join(windowsStage, "find-taiwu-game.ps1"), "\r\n", true);
normalizeText(join(windowsStage, "run-extractor.ps1"), "\r\n", true);
for (const file of ["README.md", "find-taiwu-game.sh", "taiwu-martial-extractor.sh", ...extractorFiles.map((name) => join("extractor", name))]) {
  normalizeText(join(linuxStage, file), "\n");
}

const windowsArchive = join(releaseRoot, `${windowsName}.zip`);
const linuxArchive = join(releaseRoot, `${linuxName}.tar.gz`);
rmSync(windowsArchive, { force: true });
rmSync(linuxArchive, { force: true });

if (process.platform === "win32") {
  const escapedSource = windowsStage.replace(/'/g, "''");
  const escapedTarget = windowsArchive.replace(/'/g, "''");
  execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", `Compress-Archive -LiteralPath '${escapedSource}' -DestinationPath '${escapedTarget}' -CompressionLevel Optimal`], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-rq", windowsArchive, basename(windowsStage)], { cwd: stagingRoot, stdio: "inherit" });
}
const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
if (process.platform === "win32" && existsSync(gitBash)) {
  const toBashPath = (path) => path.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll("\\", "/");
  const quote = (value) => `'${value.replaceAll("'", `'\"'\"'`)}'`;
  const command = `tar --owner=0 --group=0 --numeric-owner --mode=0755 -czf ${quote(toBashPath(linuxArchive))} -C ${quote(toBashPath(stagingRoot))} ${quote(basename(linuxStage))}`;
  execFileSync(gitBash, ["-lc", command], { stdio: "inherit" });
} else {
  execFileSync("tar", ["-czf", linuxArchive, "-C", stagingRoot, basename(linuxStage)], { stdio: "inherit" });
}

const assets = [windowsArchive, linuxArchive];
const checksums = assets.map((file) => `${createHash("sha256").update(readFileSync(file)).digest("hex")}  ${basename(file)}`).join("\n") + "\n";
const checksumFile = join(releaseRoot, `taiwu-martial-extractor-v${archiveVersion}-SHA256SUMS.txt`);
writeFileSync(checksumFile, checksums, "utf8");

console.log(JSON.stringify({ version, assets: [...assets, checksumFile] }, null, 2));
