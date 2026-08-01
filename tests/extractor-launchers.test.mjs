import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("Windows BAT stays ASCII-only and delegates to PowerShell files", () => {
  const bat = readFileSync(join(root, "windows-extractor", "태오회권_무공추출기.bat"));
  assert.ok([...bat].every((byte) => byte < 128), "BAT must remain codepage-independent ASCII");
  const source = bat.toString("ascii");
  assert.match(source, /run-extractor\.ps1/);
  assert.doesNotMatch(source, /-Command/);

  for (const file of ["run-extractor.ps1", "find-taiwu-game.ps1"]) {
    const bytes = readFileSync(join(root, "windows-extractor", file));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${file} must have a UTF-8 BOM for Windows PowerShell 5.1`);
  }
});

test("Windows launcher uses only bundled Node, Python executable and .NET runtime", () => {
  const launcher = readFileSync(join(root, "windows-extractor", "run-extractor.ps1"), "utf8");
  assert.match(launcher, /\.runtime/);
  assert.match(launcher, /node\\node\.exe/);
  assert.match(launcher, /Join-Path \$dotnetRoot "dotnet\.exe"/);
  assert.match(launcher, /taiwu-ui-extractor\.exe/);
  assert.doesNotMatch(launcher, /pip.+install|dotnet.+tool.+install|--list-sdks/si);
  assert.match(launcher, /find-taiwu-game\.ps1/);
});

test("Windows Steam path finder reads a separate library root", { skip: process.platform !== "win32" }, () => {
  const temporary = mkdtempSync(join(tmpdir(), "taiwu-steam-path-"));
  try {
    const game = join(temporary, "steamapps", "common", "The Scroll Of Taiwu");
    mkdirSync(join(game, "Backend"), { recursive: true });
    writeFileSync(join(game, "Backend", "GameData.Shared.dll"), "fixture");
    writeFileSync(join(temporary, "steamapps", "appmanifest_838350.acf"), '"appid" "838350"');
    const output = execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "windows-extractor", "find-taiwu-game.ps1")], {
      encoding: "utf8",
      env: { ...process.env, TAIWU_STEAM_ROOTS: temporary },
    }).trim();
    assert.equal(resolve(output), resolve(game));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("Linux launcher targets native Steam and Proton game files", () => {
  const launcher = readFileSync(join(root, "linux-extractor", "taiwu-martial-extractor.sh"), "utf8");
  const finder = readFileSync(join(root, "linux-extractor", "find-taiwu-game.sh"), "utf8");
  assert.match(launcher, /^#!\/usr\/bin\/env bash/);
  assert.match(launcher, /set -Eeuo pipefail/);
  assert.match(launcher, /runtime\/node\/node/);
  assert.match(launcher, /runtime\/dotnet/);
  assert.match(launcher, /taiwu-ui-extractor/);
  assert.doesNotMatch(launcher, /pip install|dotnet tool install|--list-sdks/);
  assert.match(launcher, /find-taiwu-game\.sh/);
  assert.match(finder, /com\.valvesoftware\.Steam/);
  assert.match(finder, /libraryfolders\.vdf/);
  assert.match(finder, /appmanifest_838350\.acf/);
  assert.doesNotMatch(launcher + finder, /wine|compatdata/i);
});

test("portable release workflow builds native runtime bundles on both operating systems", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "release-extractor.yml"), "utf8");
  const packager = readFileSync(join(root, "scripts", "build-extractor-release.mjs"), "utf8");
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /ubuntu-22\.04/);
  assert.match(workflow, /node-version: 22\.13\.1/);
  assert.match(workflow, /PyInstaller/);
  assert.match(workflow, /pyinstaller==6\.19\.0/);
  assert.doesNotMatch(workflow, /--collect-all (?:UnityPy|PIL)/);
  assert.match(workflow, /--collect-data UnityPy/);
  assert.match(workflow, /--hidden-import UnityPy\.resources/);
  assert.match(workflow, /--hidden-import UnityPy\.export\.SpriteHelper/);
  assert.match(workflow, /--exclude-module fmod_toolkit/);
  assert.match(workflow, /dotnet-install/);
  assert.match(workflow, /ilspycmd --version 9\.1\.0\.7988/);
  assert.match(packager, /Portable runtime is incomplete/);
  assert.match(packager, /cpSync\(runtimeRoot/);
});
