#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} 인수가 필요합니다.`);
  return resolve(args[index + 1]);
};

const dataPath = valueOf("--data");
const assetsRoot = valueOf("--assets");
const iconRoot = join(assetsRoot, "combatskilliconlegacy");
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const used = new Set(data.skills.map((skill) => skill.icon).filter(Boolean));
const combatSkillIcons = {};

for (const fileName of readdirSync(iconRoot)) {
  if (extname(fileName).toLowerCase() !== ".png") continue;
  const name = fileName.slice(0, -4);
  if (!used.has(name)) continue;
  combatSkillIcons[name] = `data:image/png;base64,${readFileSync(join(iconRoot, fileName)).toString("base64")}`;
}

data.assets = { combatSkillIcons };
data.meta.embeddedIconCount = Object.keys(combatSkillIcons).length;
writeFileSync(dataPath, `${JSON.stringify(data)}\n`, "utf8");
console.log(`업로드 파일에 인게임 무공 아이콘 ${data.meta.embeddedIconCount}개를 포함했습니다.`);
