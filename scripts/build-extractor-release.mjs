#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rawVersion = args.find((value) => /^v?\d+\.\d+\.\d+$/.test(value)) || "v1.3.0";
const version = rawVersion.startsWith("v") ? rawVersion : `v${rawVersion}`;
const valueOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const platform = valueOf("--platform", process.platform === "win32" ? "windows" : "linux");
if (!["windows", "linux"].includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
if ((platform === "windows") !== (process.platform === "win32")) throw new Error(`${platform} bundles must be packaged on their native runner.`);

const runtimeRoot = resolve(valueOf("--runtime", join(root, ".release-runtime")));
const stagingRoot = resolve(root, ".release-staging", version, platform);
const releaseRoot = resolve(root, "release");
if (!stagingRoot.startsWith(resolve(root, ".release-staging"))) throw new Error("Staging path escaped the repository.");
if (!runtimeRoot.startsWith(root)) throw new Error("Runtime path must stay inside the repository workspace.");

const requiredRuntimeFiles = platform === "windows" ? [
  "node/node.exe",
  "dotnet/dotnet.exe",
  "ilspy/ilspycmd.exe",
  "ui/taiwu-ui-extractor/taiwu-ui-extractor.exe",
] : [
  "node/node",
  "dotnet/dotnet",
  "ilspy/ilspycmd",
  "ui/taiwu-ui-extractor/taiwu-ui-extractor",
];
for (const file of requiredRuntimeFiles) {
  if (!existsSync(join(runtimeRoot, file))) throw new Error(`Portable runtime is incomplete: ${file}`);
}

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingRoot, { recursive: true });
mkdirSync(releaseRoot, { recursive: true });

const archiveVersion = version.slice(1);
const bundleName = `taiwu-martial-extractor-${platform}-v${archiveVersion}`;
const stage = join(stagingRoot, bundleName);
mkdirSync(stage, { recursive: true });

const launcherRoot = join(root, `${platform}-extractor`);
const launcherFiles = platform === "windows"
  ? ["README.txt", "태오회권_무공추출기.bat", "find-taiwu-game.ps1", "run-extractor.ps1"]
  : ["README.md", "find-taiwu-game.sh", "taiwu-martial-extractor.sh"];
for (const file of launcherFiles) cpSync(join(launcherRoot, file), join(stage, file));

const extractorTarget = join(stage, "extractor");
mkdirSync(extractorTarget, { recursive: true });
for (const file of ["code-ir.mjs", "code-composition.mjs", "config-schema.mjs", "embed-portable-assets.mjs", "extract.mjs", "THIRD_PARTY_NOTICES.txt"]) {
  cpSync(join(root, "extractor", file), join(extractorTarget, file));
}
cpSync(runtimeRoot, join(stage, ".runtime"), { recursive: true });

function normalizeText(file, eol, withBom = false) {
  const text = readFileSync(file, "utf8").replace(/^\ufeff/, "").replace(/\r?\n/g, eol);
  const encoded = Buffer.from(text, "utf8");
  writeFileSync(file, withBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded]) : encoded);
}

if (platform === "windows") {
  normalizeText(join(stage, "태오회권_무공추출기.bat"), "\r\n");
  normalizeText(join(stage, "README.txt"), "\r\n");
  normalizeText(join(stage, "find-taiwu-game.ps1"), "\r\n", true);
  normalizeText(join(stage, "run-extractor.ps1"), "\r\n", true);
} else {
  for (const file of ["README.md", "find-taiwu-game.sh", "taiwu-martial-extractor.sh", "extractor/code-ir.mjs", "extractor/code-composition.mjs", "extractor/config-schema.mjs", "extractor/embed-portable-assets.mjs", "extractor/extract.mjs"]) {
    normalizeText(join(stage, file), "\n");
  }
  for (const file of [
    "find-taiwu-game.sh",
    "taiwu-martial-extractor.sh",
    ".runtime/node/node",
    ".runtime/dotnet/dotnet",
    ".runtime/ilspy/ilspycmd",
    ".runtime/ui/taiwu-ui-extractor/taiwu-ui-extractor",
  ]) chmodSync(join(stage, file), 0o755);
}

const archive = join(releaseRoot, platform === "windows" ? `${bundleName}.zip` : `${bundleName}.tar.gz`);
rmSync(archive, { force: true });
if (platform === "windows") {
  const escapedSource = stage.replace(/'/g, "''");
  const escapedTarget = archive.replace(/'/g, "''");
  execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", `Compress-Archive -LiteralPath '${escapedSource}' -DestinationPath '${escapedTarget}' -CompressionLevel Optimal`], { stdio: "inherit" });
} else {
  execFileSync("tar", ["--owner=0", "--group=0", "--numeric-owner", "-czf", archive, "-C", stagingRoot, basename(stage)], { stdio: "inherit" });
}

console.log(JSON.stringify({ version, platform, archive }, null, 2));
