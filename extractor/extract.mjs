#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCodeLogic } from "./code-ir.mjs";

const argv = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultGame = "";
const gameRoot = resolve(valueOf("--game", process.env.TAIWU_GAME_DIR || defaultGame));
const outputFile = resolve(valueOf("--out", join(projectRoot, "app", "data", "combat-skills.json")));
const portableFile = valueOf("--portable", "");
const cacheRoot = resolve(valueOf("--cache", join(projectRoot, "extractor", ".cache")));
const withCode = !argv.includes("--no-code");

const backend = join(gameRoot, "Backend");
const sharedDll = join(backend, "GameData.Shared.dll");
const gameDll = join(backend, "GameData.dll");
const managed = join(gameRoot, "The Scroll of Taiwu_Data", "Managed");
const clientDll = join(managed, "Assembly-CSharp.dll");
const stream = join(gameRoot, "The Scroll of Taiwu_Data", "StreamingAssets");
const languageKo = join(stream, "Language_KO");
const languageCn = join(stream, "Language_CN");

for (const path of [sharedDll, gameDll, clientDll, languageKo, languageCn]) {
  if (!existsSync(path)) throw new Error(`필수 게임 파일을 찾지 못했습니다: ${path}`);
}

mkdirSync(cacheRoot, { recursive: true });
mkdirSync(dirname(outputFile), { recursive: true });

function findIlspy() {
  const explicit = valueOf("--ilspy", process.env.ILSPYCMD);
  if (explicit) return { command: explicit, prefix: [] };
  const bundled = resolve(projectRoot, "..", ".tools", "ilspycmd.exe");
  if (existsSync(bundled)) return { command: bundled, prefix: [] };
  return { command: "dotnet", prefix: ["tool", "run", "ilspycmd", "--"] };
}

const ilspy = findIlspy();
function decompileType(typeName) {
  const destination = join(cacheRoot, `${typeName}.decompiled.cs`);
  if (!existsSync(destination) || statSync(destination).mtimeMs < statSync(sharedDll).mtimeMs) {
    execFileSync(ilspy.command, [...ilspy.prefix, "-r", backend, "-t", typeName, "-o", cacheRoot, sharedDll], {
      stdio: "inherit",
    });
  }
  return readFileSync(destination, "utf8");
}

function decompileClientType(typeName) {
  const destination = join(cacheRoot, `${typeName}.client.decompiled.cs`);
  if (!existsSync(destination) || statSync(destination).mtimeMs < statSync(clientDll).mtimeMs) {
    const temporary = join(cacheRoot, `${typeName}.decompiled.cs`);
    execFileSync(ilspy.command, [...ilspy.prefix, "-r", managed, "-t", typeName, "-o", cacheRoot, clientDll], { stdio: "inherit" });
    if (!existsSync(temporary)) throw new Error(`클라이언트 UI 형식을 역컴파일하지 못했습니다: ${typeName}`);
    writeFileSync(destination, readFileSync(temporary));
  }
  return readFileSync(destination, "utf8");
}

function decompileCode() {
  const destination = join(cacheRoot, "GameData");
  const marker = join(destination, ".complete");
  if (!existsSync(marker) || statSync(marker).mtimeMs < statSync(gameDll).mtimeMs) {
    mkdirSync(destination, { recursive: true });
    execFileSync(ilspy.command, [...ilspy.prefix, "-p", "--nested-directories", "-r", backend, "-o", destination, gameDll], {
      stdio: "inherit",
    });
    writeFileSync(marker, new Date().toISOString());
  }
  return destination;
}

function readPairs(path) {
  const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const data = new Map();
  for (let index = 0; index + 1 < lines.length; index += 2) data.set(lines[index], lines[index + 1]);
  return data;
}

function mergePairs(basePath, overlayPaths = []) {
  const result = readPairs(basePath);
  for (const overlayPath of overlayPaths) {
    if (!existsSync(overlayPath)) continue;
    for (const [key, value] of readPairs(overlayPath)) result.set(key, value);
  }
  return result;
}

function luaValue(source, key) {
  return source.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*["']([^"']+)["']`))?.[1] || "";
}

const localModRoot = join(gameRoot, "Mod");
const localizationMods = existsSync(localModRoot)
  ? readdirSync(localModRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const root = join(localModRoot, entry.name);
      const language = join(root, "Localization", "Language_KO");
      const configPath = join(root, "Config.lua");
      if (!existsSync(language)) return null;
      const config = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
      return { name: entry.name, language, version: luaValue(config, "Version"), gameVersion: luaValue(config, "GameVersion") };
    })
    .filter(Boolean)
  : [];
const overlayFiles = (fileName) => localizationMods.map((mod) => join(mod.language, fileName)).filter(existsSync);

const appManifestPath = resolve(gameRoot, "..", "..", "appmanifest_838350.acf");
const appManifest = existsSync(appManifestPath) ? readFileSync(appManifestPath, "utf8") : "";
const steamBuildId = appManifest.match(/"buildid"\s+"(\d+)"/)?.[1] || "unknown";
const gameVersion = localizationMods.find((mod) => mod.gameVersion)?.gameVersion || "unknown";
const versionSuffix = localizationMods.map((mod) => `${mod.name}${mod.version ? `-${mod.version}` : ""}`).join("+");
const datasetVersion = `${gameVersion}-steam${steamBuildId}${versionSuffix ? `-${versionSuffix}` : ""}`;

function unquote(value) {
  const trimmed = value.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) return JSON.parse(trimmed);
  return trimmed;
}

function readInteger(value, fallback = 0) {
  const match = value.match(/-?\d+/);
  return match ? Number(match[0]) : fallback;
}

function extractCalls(source, constructorName) {
  const needle = `new ${constructorName}(`;
  const calls = [];
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) >= 0) {
    const start = offset + needle.length;
    let depth = 1;
    let quote = false;
    let escaped = false;
    let cursor = start;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      const char = source[cursor];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quote = false;
      } else if (char === '"') quote = true;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
    }
    calls.push(source.slice(start, cursor - 1));
    offset = cursor;
  }
  return calls;
}

function splitArguments(call) {
  const result = [];
  let start = 0;
  let quote = false;
  let escaped = false;
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < call.length; index += 1) {
    const char = call[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') quote = true;
    else if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "{") curly += 1;
    else if (char === "}") curly -= 1;
    else if (char === "," && round === 0 && square === 0 && curly === 0) {
      result.push(call.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(call.slice(start).trim());
  return result;
}

const combatSource = decompileType("Config.CombatSkill");
const effectSource = decompileType("Config.SpecialEffect");
const weaponSource = decompileType("Config.Weapon");
const trickSource = decompileType("Config.TrickType");
const dataFieldSource = decompileType("Config.SpecialEffectDataField");
const combatSkillHelperSource = decompileType("GameData.Domains.Character.CombatSkillHelper");
const globalConfigSource = decompileType("GlobalConfig");
const equipUiSource = decompileClientType("UI_CharacterMenuEquipCombatSkill");
const codeRoot = withCode ? decompileCode() : null;
const combatKo = mergePairs(join(languageKo, "CombatSkill_language.txt"), overlayFiles("CombatSkill_language.txt"));
const combatCn = readPairs(join(languageCn, "CombatSkill_language.txt"));
const effectKo = mergePairs(join(languageKo, "SpecialEffect_language.txt"), overlayFiles("SpecialEffect_language.txt"));
const effectCn = readPairs(join(languageCn, "SpecialEffect_language.txt"));
const weaponKo = mergePairs(join(languageKo, "Weapon_language.txt"), overlayFiles("Weapon_language.txt"));
const weaponCn = readPairs(join(languageCn, "Weapon_language.txt"));
const trickKo = mergePairs(join(languageKo, "TrickType_language.txt"), overlayFiles("TrickType_language.txt"));
const trickCn = readPairs(join(languageCn, "TrickType_language.txt"));
const dataFieldKo = mergePairs(join(languageKo, "SpecialEffectDataField_language.txt"), overlayFiles("SpecialEffectDataField_language.txt"));
const dataFieldCn = readPairs(join(languageCn, "SpecialEffectDataField_language.txt"));
const combatSkillTypeKo = mergePairs(join(languageKo, "CombatSkillType_language.txt"), overlayFiles("CombatSkillType_language.txt"));
const organizationKo = mergePairs(join(languageKo, "Organization_language.txt"), overlayFiles("Organization_language.txt"));
const organizationCn = readPairs(join(languageCn, "Organization_language.txt"));
const uiKo = mergePairs(join(languageKo, "ui_language.txt"), overlayFiles("ui_language.txt"));

const effectRows = new Map();
for (const call of extractCalls(effectSource, "SpecialEffectItem")) {
  const args = splitArguments(call);
  if (args.length < 24) continue;
  const id = readInteger(args[0], -1);
  const skillId = readInteger(args[18], -1);
  const className = unquote(args[23]);
  effectRows.set(id, { id, skillId, className, activeType: readInteger(args[1], -1) });
}

const affectedFields = extractCalls(dataFieldSource, "SpecialEffectDataFieldItem").map((call) => {
  const args = splitArguments(call);
  const id = readInteger(args[0], -1);
  return {
    id,
    name: dataFieldKo.get(`Name_${id}`) || dataFieldCn.get(`Name_${id}`) || `전투 필드 ${id}`,
    nameCn: dataFieldCn.get(`Name_${id}`) || "",
    fieldName: unquote(args[2]),
  };
}).filter((field) => field.id >= 0);
const affectedFieldById = new Map(affectedFields.map((field) => [field.id, field]));

function numbersInList(expression) {
  const body = expression.match(/\{([\s\S]*?)\}/)?.[1] || "";
  return [...body.matchAll(/-?\d+/g)].map((match) => Number(match[0]));
}

const uiProfile = {
  equipTypeCount: readInteger(combatSkillHelperSource.match(/MaxSlotCounts\s*=([^;]+)/)?.[1] || "", 5),
  maxSlotCounts: numbersInList(combatSkillHelperSource.match(/MaxSlotCounts\s*=([^;]+)/)?.[1] || "").slice(-5),
  slotBeginIndexes: numbersInList(combatSkillHelperSource.match(/SlotBeginIndexes\s*=([^;]+)/)?.[1] || "").slice(-5),
  slotEndIndexes: numbersInList(combatSkillHelperSource.match(/SlotEndIndexes\s*=([^;]+)/)?.[1] || "").slice(-5),
  totalSlotCount: readInteger(combatSkillHelperSource.match(/TotalSlotCount\s*=\s*([^;]+)/)?.[1] || "45", 45),
  globalMaxSlotCount: readInteger(combatSkillHelperSource.match(/GlobalMaxSlotCount\s*=\s*([^;]+)/)?.[1] || "99", 99),
  genericAllocationCostFactor: numbersInList(combatSkillHelperSource.match(/GenericAllocationCostFactor\s*=([^;]+)/)?.[1] || ""),
  initialSlotCounts: numbersInList(globalConfigSource.match(/CombatSkillInitialEquipSlotCounts\s*=([^;]+)/)?.[1] || "").slice(-6),
  slotVisualSize: {
    width: Number(equipUiSource.match(/SlotSize\s*=\s*new Vector2\(([\d.]+)f?/)?.[1] || 186),
    height: Number(equipUiSource.match(/SlotSize\s*=\s*new Vector2\([\d.]+f?,\s*([\d.]+)f?/)?.[1] || 200),
  },
  equipTypeLogos: numbersInList(equipUiSource.match(/_equipTypeLogos\s*=([^;]+)/)?.[1] || "").slice(-5),
  supportsGenericGridAllocation: /AllocateGenericGrid/.test(equipUiSource),
  supportsMultiplePlans: /_currEquipPlan|PlanHolder/.test(equipUiSource),
};

const tricks = extractCalls(trickSource, "TrickTypeItem").map((call) => {
  const args = splitArguments(call);
  const id = readInteger(args[0], -1);
  return {
    id,
    name: trickKo.get(`Name_${id}`) || trickCn.get(`Name_${id}`) || `식 ${id}`,
    nameCn: unquote(args[2]),
    avoidType: readInteger(args[5], -1),
    attackDistances: numbersInList(args[6]),
  };
}).filter((item) => item.id >= 0);
const trickById = new Map(tricks.map((trick) => [trick.id, trick]));

const weapons = extractCalls(weaponSource, "WeaponItem").map((call) => {
  const args = splitArguments(call);
  if (args.length < 73) return null;
  const id = readInteger(args[0], -1);
  return {
    id,
    name: weaponKo.get(`Name_${id}`) || weaponCn.get(`Name_${id}`) || `무기 ${id}`,
    nameCn: weaponCn.get(`Name_${id}`) || "",
    subType: readInteger(args[3], -1),
    grade: readInteger(args[4], 0) + 1,
    groupId: readInteger(args[5], -1),
    tricks: numbersInList(args[59]),
    randomTrick: /true/.test(args[61]),
    canChangeTrick: /true/.test(args[62]),
    changeTrickPercent: readInteger(args[63], 0),
    pursueFactor: readInteger(args[64], 0),
    minDistance: readInteger(args[68], 0),
    maxDistance: readInteger(args[69], 0),
  };
}).filter(Boolean);
const weaponById = new Map(weapons.map((weapon) => [weapon.id, weapon]));

function resolveNeedTricks(argument, skillId) {
  let source = argument;
  if (!/new NeedTrick\(/.test(source) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) {
    const callIndex = combatSource.indexOf(`new CombatSkillItem(${skillId},`);
    const declaration = `List<NeedTrick> ${source} =`;
    const declarationIndex = combatSource.lastIndexOf(declaration, callIndex);
    if (declarationIndex >= 0) source = combatSource.slice(declarationIndex, callIndex);
  }
  return [...source.matchAll(/new NeedTrick\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)].map((match) => {
    const trickId = Number(match[1]);
    return { trickId, name: trickById.get(trickId)?.name || `식 ${trickId}`, nameCn: trickById.get(trickId)?.nameCn || "", count: Number(match[2]) };
  });
}

function resolveSourceForArgument(argument, skillId, declarationType) {
  if (/new\s/.test(argument)) return argument;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(argument)) return argument;
  const callIndex = combatSource.indexOf(`new CombatSkillItem(${skillId},`);
  const declarationIndex = combatSource.lastIndexOf(`${declarationType} ${argument} =`, callIndex);
  return declarationIndex >= 0 ? combatSource.slice(declarationIndex, callIndex) : argument;
}

function resolveNumberArray(argument, skillId, declarationType) {
  return numbersInList(resolveSourceForArgument(argument, skillId, declarationType));
}

function resolvePropertyValues(argument, skillId) {
  const source = resolveSourceForArgument(argument, skillId, "List<PropertyAndValue>");
  return [...source.matchAll(/new PropertyAndValue\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)].map((match) => {
    const fieldId = Number(match[1]);
    return { fieldId, name: affectedFieldById.get(fieldId)?.name || `속성 ${fieldId}`, value: Number(match[2]) };
  });
}

function resolvePoisons(argument, skillId) {
  const source = resolveSourceForArgument(argument, skillId, "PoisonsAndLevels");
  const call = extractCalls(source, "PoisonsAndLevels")[0];
  if (!call) return [];
  const poisonNames = ["열독", "열독 등급", "울독", "울독 등급", "한독", "한독 등급", "적독", "적독 등급", "부독", "부독 등급", "환독", "환독 등급"];
  return splitArguments(call).map((value, index) => ({ name: poisonNames[index] || `독 ${index}`, value: /default/.test(value) ? 0 : readInteger(value, 0) })).filter((item) => item.value !== 0);
}

function valuesFor(map, prefix, id) {
  const result = [];
  for (let index = 0; ; index += 1) {
    const value = map.get(`${prefix}_${id}_${index}`);
    if (value === undefined) break;
    if (value) result.push(value);
  }
  return result;
}

let codeClassIndex = null;
const codeClosureCache = new Map();

function indexCodeClasses() {
  if (codeClassIndex || !codeRoot) return codeClassIndex;
  codeClassIndex = new Map();
  const root = join(codeRoot, "GameData", "Domains", "SpecialEffect");
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".cs")) {
        const source = readFileSync(path, "utf8");
        const declaration = source.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)(?:<[^>{}]+>)?\s*(?::\s*([A-Za-z_][A-Za-z0-9_.]*(?:<[^>{}]+>)?))?/);
        if (!declaration) continue;
        const name = declaration[1];
        const baseName = declaration[2]?.replace(/<.*$/, "").split(".").at(-1) || null;
        const existing = codeClassIndex.get(name) || [];
        existing.push({ name, baseName, path, source });
        codeClassIndex.set(name, existing);
      }
    }
  };
  visit(root);
  return codeClassIndex;
}

function codeFor(className) {
  if (!codeRoot || !className || className === "null") return "";
  if (codeClosureCache.has(className)) return codeClosureCache.get(className);
  const path = join(codeRoot, "GameData", "Domains", "SpecialEffect", ...className.split(".")) + ".cs";
  if (!existsSync(path)) return "";
  const index = indexCodeClasses();
  const chain = [];
  const visited = new Set();
  let current = { source: readFileSync(path, "utf8"), baseName: null, path };
  for (let depth = 0; current && depth < 16; depth += 1) {
    const declaration = current.source.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)(?:<[^>{}]+>)?\s*(?::\s*([A-Za-z_][A-Za-z0-9_.]*(?:<[^>{}]+>)?))?/);
    const currentName = declaration?.[1] || basename(current.path, ".cs");
    const baseName = declaration?.[2]?.replace(/<.*$/, "").split(".").at(-1) || current.baseName;
    if (visited.has(currentName)) break;
    visited.add(currentName);
    chain.push(`// inheritance:${depth}:${currentName}\n${current.source}`);
    if (!baseName || ["Object", "SpecialEffectBase", "CombatSkillSpecialEffectBase"].includes(baseName)) break;
    const candidates = index.get(baseName) || [];
    current = candidates.find((candidate) => /Common/.test(candidate.path)) || candidates[0] || null;
  }
  const result = chain.join("\n\n");
  codeClosureCache.set(className, result);
  return result;
}

const tagRules = [
  ["자동발동", /自动(?:施展|使用|发动|攻击)|자동(?:으로|발동|시전|공격)/i],
  ["전진", /前进|전진/i],
  ["후진", /后退|후퇴|후진/i],
  ["독", /毒|중독|독소|독성/i],
  ["부상", /伤势|伤口|부상/i],
  ["오래된부상", /旧(?:时)?伤势|旧伤|오래된 부상/i],
  ["생존", /战败条件|不死|不可战败|패배 조건|불사/i],
  ["피해감소", /降低.{0,8}(?:伤害|피해)|(?:伤害|피해).{0,8}(?:降低|감소)/i],
  ["방어", /防御|化解|护体|방어|파해|호체/i],
  ["회복", /治愈|恢复|消除己|회복|치유|제거/i],
  ["표식", /标记|표식/i],
  ["봉혈", /封穴|봉혈/i],
  ["파열", /破绽|파열|약점/i],
  ["실신", /失神|실신/i],
  ["이동", /移动|거리|전진|후퇴|movement|move/i],
];

const conceptRules = [
  ["직접 피해", /直接伤害|직접 피해/i],
  ["외상", /外伤|외상/i],
  ["내상", /内伤|내상/i],
  ["중상", /重创|중상/i],
  ["부상", /伤势|伤口|부상/i],
  ["오래된 부상", /旧(?:时)?伤势|旧伤|오래된 부상|구상처/i],
  ["파열", /破绽|파열|약점/i],
  ["봉혈", /封穴|봉혈/i],
  ["실신", /失神|실신/i],
  ["필사 표식", /必死标记|필사 표식/i],
  ["패배 표식", /战败标记|패배 표식/i],
  ["표식", /标记|표식/i],
  ["독", /毒素|毒害|中毒|독소|독성|중독/i],
  ["독 등급", /毒素级别|독.*등급/i],
  ["독 저항", /毒素抵抗|毒抗|독.*저항/i],
  ["고독", /蛊虫|蛊引|王蛊|种下.*蛊|고독|고충/i],
  ["내식 문란", /内息紊乱|紊乱|내식 문란/i],
  ["자세", /架势|자세/i],
  ["호흡", /提气|呼吸|호흡/i],
  ["기세", /气势|기세/i],
  ["각력", /脚力|각력/i],
  ["신법", /身法|신법/i],
  ["진기", /真气|진기/i],
  ["내공 진기", /内功.*真气|内力|내공.*진기|내력/i],
  ["파괴 진기", /摧破真气|최파 진기|파괴 진기/i],
  ["경령 진기", /轻灵真气|경령 진기/i],
  ["호체 진기", /护体真气|호체 진기/i],
  ["기교 진기", /奇窍.*真气|기규.*진기|기교.*진기/i],
  ["식", /蓄式|「[^」]{1,2}」式|축식|「[^」]{1,2}」 식/i],
  ["살식", /「杀」式|杀式|살식/i],
  ["공격 거리", /攻击范围|敌我距离|공격 범위|적과.*거리/i],
  ["전진", /前进|전진/i],
  ["후진", /后退|후퇴|후진/i],
  ["이동", /移动|move|이동/i],
  ["추격", /追击|추격/i],
  ["명중", /命中|명중/i],
  ["회피·파해", /闪避|化解|회피|파해/i],
  ["파체", /破体|파체/i],
  ["파기", /破气|파기/i],
  ["방어", /防御|护体|御体|御气|방어|호체|어체|어기/i],
  ["피해 감소", /降低所受.*伤|伤害降低|받는.*피해.*감소/i],
  ["반격·반사", /反击|反震|反噬|반격|반사|반진|반식/i],
  ["무공 위력", /功法威力|神力威力|무공.*위력|신력.*위력/i],
  ["시전 진행", /施展进度|시전.*진행/i],
  ["시전 속도", /施展速度|시전.*속도/i],
  ["공격 속도", /攻击速度|공격.*속도/i],
  ["이동 속도", /移动速度|이동.*속도/i],
  ["무기", /兵器|武器|暗器|무기|병기|암기/i],
  ["방어구", /护具|护甲|방어구|호구/i],
  ["장비", /装备|장비/i],
  ["내구도", /耐久|损耗.*装备|내구/i],
  ["파괴 공법", /摧破功法|최파.*무공|파괴.*공법/i],
  ["경령 무공", /轻灵功法|경령.*무공|경공/i],
  ["호체 무공", /护体功法|호체.*무공/i],
  ["기교 공법", /奇窍功法|기규.*무공|기교.*공법/i],
  ["내공", /内功|내공/i],
  ["강화 상태", /增益状态|增益|강화 상태|버프/i],
  ["약화 상태", /减益状态|损害状态|약화 상태|디버프/i],
  ["봉금", /封禁|封印|봉금|봉인/i],
  ["행동", /行动|행동/i],
  ["기억", /记忆|기억/i],
  ["오행", /五行|오행/i],
];

const triggerRules = [
  ["전투 시작", /战斗开始|进入战斗|전투 시작/i],
  ["시전 시작", /开始施展|施展开始|시전 시작/i],
  ["시전 완료", /施展结束|施展完毕|시전 완료|시전 종료/i],
  ["무공 시전", /施展(?:此|该|其它|任意)?.{0,8}(?:功法|神力)|무공.*시전|시전할 때/i],
  ["공격 명중", /命中敌|击中敌|적.*명중/i],
  ["공격 빗나감", /未命中|攻击落空|빗나/i],
  ["파해 성공", /将敌.*化解|化解敌.*攻击|파해할 때/i],
  ["피격", /受到.*伤害|受.*攻击|피해를 받을 때|피격/i],
  ["직접 피해 발생", /造成.*直接伤害|受到.*直接伤害|직접 피해/i],
  ["이동", /每当.*移动|移动时|이동할 때/i],
  ["전진", /前进时|每前进|전진할 때|전진할 때마다/i],
  ["후진", /后退时|每后退|후퇴할 때|후진할 때/i],
  ["무기 교체", /切换.*兵器|更换.*兵器|무기.*교체/i],
  ["추격", /追击时|追击.*攻击|추격할 때/i],
  ["표식 발생", /出现.*标记|获得.*标记|표식.*생길 때|표식.*발생/i],
  ["부상 발생", /出现.*伤势|受到.*伤势|부상.*생길 때/i],
  ["독 발작", /毒发|毒素发作|독.*발작/i],
  ["패배 임계", /达到战败条件|패배 조건.*도달/i],
  ["시간 경과", /每(?:秒|隔)|持续.*秒|초마다|시간.*지남/i],
  ["무공 전환", /切换.*功法|功法.*切换|무공.*전환/i],
];

const actionRules = {
  produces: /增加|添加|施加|造成|获得|产生|出现|生成|种下|转为|变为|恢复|治愈|吸取|提高|提升|부여|추가|발생|획득|생성|전환|회복|흡수|증가/i,
  consumes: /消耗|损耗|夺取|吞噬|耗尽|소모|손실|탈취|고갈/i,
  clears: /消除|移除|驱除|治愈|清除|抵消|转移|제거|해제|치유|정화|전이/i,
  amplifies: /提高|增加|提升|强化|恶化|延长|加快|증가|향상|강화|악화|연장|가속/i,
  reduces: /降低|减少|减弱|缩短|恢复|치유|감소|저하|약화|단축|회복/i,
  prevents: /禁止|无法|免受|免于|无效|无视|抵消|不可(?!避免)|不会|금지|불가(?!피)|면역|무효|무시|방지/i,
  requires: /当|每当|如果|若|根据|每有|需要|때|경우|마다|보유|필요/i,
};

function matchedConcepts(text) {
  return conceptRules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function normalizeMechanicAxis(value) {
  return value
    .replace(/提高|增加|降低|减少|减弱|强化|增强|获得|造成|施加|消除|恢复|治愈|损耗|消耗|夺取|吸取|转移|变化|变为|封禁|禁止|自动|再次|额外|随机|大量|更多|持续|直接|己之|敌之|所受|受到|免于|免受|无视|无法|加快|延迟|积蓄|添加|产生/g, "")
    .replace(/[\s「」·、，。,.%$0-9]/g, "")
    .trim();
}

const harmfulResources = new Set([
  "직접 피해", "피해", "외상", "내상", "중상", "부상", "오래된 부상", "파열", "봉혈", "실신",
  "필사 표식", "패배 표식", "독", "독 등급", "고독", "내식 문란", "약화 상태", "봉금", "무기 내구도",
]);
const beneficialResources = new Set([
  "자세", "호흡", "기세", "각력", "신법", "진기", "내공 진기", "파괴 진기", "경령 진기", "호체 진기", "기교 진기",
  "식", "공격 거리", "이동 속도", "명중", "회피·파해", "파체", "파기", "방어", "피해 감소", "반격·반사",
  "무공 위력", "시전 진행", "시전 속도", "공격 속도", "강화 상태", "내구도", "오행",
]);

function semanticTargetFor(text) {
  const self = /운용자|사용자|자신|본인|스스로|己方|自身|自己|运用者|使用者/i.test(text);
  const enemy = /(?:^|[^가-힣])적(?:의|에게|이|을|과|은|이)?|상대|敌人|敌方|对手/i.test(text);
  if (self && enemy) return "양측";
  if (enemy) return "적";
  if (self) return "자신";
  return "미상";
}

function resourceValence(resource) {
  if (harmfulResources.has(resource)) return "해로운 상태";
  if (beneficialResources.has(resource)) return "이로운 상태";
  return "중립 자원";
}

function buildSemanticEdges(clauses, logic) {
  const edges = [];
  for (const operation of logic.operations) {
    for (const resource of operation.resources) {
      if (resource === "전투 상태") continue;
      edges.push({
        verb: operation.verb,
        resource,
        target: operation.target,
        valence: resourceValence(resource),
        source: "code",
        confidence: operation.target === "전투 상태" ? 1 : 3,
        evidence: operation.evidence,
      });
    }
  }
  for (const clause of clauses) {
    const resources = matchedConcepts(clause);
    if (!resources.length) continue;
    const target = semanticTargetFor(clause);
    const verbs = [];
    const convertsToOldInjury = resources.includes("오래된 부상")
      && /转(?:化)?为|变为|전환|구상처로\s*변|오래된\s*부상(?:으)?로\s*변/i.test(clause);
    if (convertsToOldInjury) verbs.push("produces");
    else if (actionRules.prevents.test(clause)) verbs.push("prevents");
    else if (actionRules.clears.test(clause)) verbs.push("clears");
    else if (actionRules.consumes.test(clause)) verbs.push("consumes");
    else if (actionRules.reduces.test(clause)) verbs.push("reduces");
    else if (actionRules.produces.test(clause)) verbs.push("produces");
    else if (actionRules.amplifies.test(clause)) verbs.push("amplifies");
    if (actionRules.requires.test(clause)) verbs.push("requires");
    for (const verb of [...new Set(verbs)]) {
      for (const resource of resources) {
        edges.push({
          verb,
          resource,
          target,
          valence: resourceValence(resource),
          source: "tooltip",
          confidence: target === "미상" ? 1 : 2,
          evidence: clause.replace(/<[^>]+>/g, "").trim().slice(0, 220),
        });
      }
    }
  }
  return [...new Map(edges.map((edge) => [
    `${edge.verb}|${edge.resource}|${edge.target}|${edge.source}`,
    edge,
  ])).values()];
}

function analyzeEffect(textKo, textCn, code, mode, shortKo = [], shortCn = []) {
  const text = `${textCn} ${textKo}`;
  const concepts = matchedConcepts(text);
  const triggers = triggerRules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const buckets = { produces: [], consumes: [], clears: [], amplifies: [], reduces: [], prevents: [], requires: [] };
  const clauses = text.split(/[；;。.!！?？，,\n]/).filter(Boolean);
  for (const clause of clauses) {
    const clauseConcepts = matchedConcepts(clause);
    for (const [bucket, pattern] of Object.entries(actionRules)) {
      if (pattern.test(clause)) buckets[bucket].push(...clauseConcepts);
    }
  }
  const unique = (values) => [...new Set(values)];
  const logic = extractCodeLogic(code, mode);
  const semanticEdges = buildSemanticEdges(clauses, logic);
  const codeEvents = logic.events.map((event) => event.name);
  const codeEventLabels = unique(logic.events.map((event) => event.label));
  const codeSignals = logic.symbols;
  const affectedFieldIds = logic.affectedFieldIds;
  for (const eventLabel of codeEventLabels) {
    if (eventLabel !== "코드 이벤트") triggers.push(eventLabel);
  }
  for (const operation of logic.operations) {
    if (buckets[operation.verb]) buckets[operation.verb].push(...operation.resources.filter((resource) => resource !== "전투 상태"));
  }
  for (const condition of logic.conditions) {
    if (condition.polarity === "requires") buckets.requires.push(...condition.resources);
  }
  const quotedAxes = [...textCn.matchAll(/「([^」]{1,24})」/g)].map((match) => match[1]);
  const quotedLabels = [...textKo.matchAll(/「([^」]{1,24})」/g)].map((match) => match[1]);
  const explicitAxes = [...textCn.matchAll(/(?:功法|神力)(?:威力|发挥|消耗|施展|命中|伤害|层数|封禁|效果|需求|上限)/g)].map((match) => match[0]);
  const mechanicAxes = unique([...shortCn.map(normalizeMechanicAxis), ...quotedAxes, ...explicitAxes].filter((axis) => axis.length >= 2));
  if (mechanicAxes.length === 0) {
    const fallbackAxis = normalizeMechanicAxis(textCn).replace(/运用者|敌人|此功法|该功法|最终|每当|如果|以及|并且/g, "").slice(0, 32);
    if (fallbackAxis.length >= 2) mechanicAxes.push(fallbackAxis);
  }
  if (/GetOldInjuries\(\)/.test(code) && /Subtract\(/.test(code)) {
    buckets.requires.push("현재 부상");
    buckets.prevents.push("오래된 부상 회복");
  }
  if (/AutoCast|AutoUse|AutoAttack|RequestUseCombatSkill/i.test(code) || /自动(?:施展|使用|攻击)|자동(?:발동|시전|공격)/i.test(text)) {
    buckets.produces.push("자동 시전");
  }
  return {
    concepts: unique(concepts),
    triggers: unique(triggers),
    produces: unique(buckets.produces),
    consumes: unique(buckets.consumes),
    clears: unique(buckets.clears),
    amplifies: unique(buckets.amplifies),
    reduces: unique(buckets.reduces),
    prevents: unique(buckets.prevents),
    requires: unique(buckets.requires),
    mechanicAxes,
    mechanicLabels: unique([...shortKo.filter(Boolean), ...quotedLabels]),
    codeEvents,
    codeEventLabels,
    codeSignals,
    affectedFields: affectedFieldIds.map((fieldId) => affectedFieldById.get(fieldId)?.name || `전투 필드 ${fieldId}`),
    affectedFieldIds,
    semanticEdges,
    logic: {
      ...logic,
      affectedFields: affectedFieldIds.map((fieldId) => affectedFieldById.get(fieldId)?.name || `전투 필드 ${fieldId}`),
    },
  };
}

function detectTags(text, code) {
  const tags = new Set();
  for (const [tag, pattern] of tagRules) if (pattern.test(text)) tags.add(tag);
  if (/GetOldInjuries\(\)/.test(code) && /Subtract\(/.test(code)) tags.add("현재부상만");
  if (/changeToOld:\s*true|Change.*ToOld|OldInjur/i.test(code) && !tags.has("현재부상만")) tags.add("오래된부상");
  if (/AutoCast|AutoUse|AutoAttack/i.test(code)) tags.add("자동발동");
  if (/Poison|WugEffect/i.test(code)) tags.add("독");
  return [...tags];
}

const equipNames = Array.from({ length: 5 }, (_, index) => uiKo.get(`LK_CombatSkill_EquipType_${index}`) || ["내공", "파괴", "경령", "호체", "기교"][index]);
// CombatSkillConfig.FiveElements uses the game's internal-energy schools,
// not the literal metal/wood/water/fire/earth labels.
const elementNames = ["금강", "자하", "현음", "순양", "귀원", "혼원"];

const skills = [];
for (const call of extractCalls(combatSource, "CombatSkillItem")) {
  const args = splitArguments(call);
  if (args.length < 20) continue;
  const id = readInteger(args[0], -1);
  if (id < 0) continue;
  const directId = readInteger(args[16], -1);
  const reverseId = readInteger(args[17], -1);
  const directRow = effectRows.get(directId);
  const reverseRow = effectRows.get(reverseId);
  const className = directRow?.className || reverseRow?.className || null;
  const code = codeFor(className);
  const directDesc = valuesFor(effectKo, "DetailedDesc", directId).join(" ") || valuesFor(effectKo, "Desc", directId).join(" ");
  const reverseDesc = valuesFor(effectKo, "DetailedDesc", reverseId).join(" ") || valuesFor(effectKo, "Desc", reverseId).join(" ");
  const directCn = valuesFor(effectCn, "DetailedDesc", directId).join(" ") || valuesFor(effectCn, "Desc", directId).join(" ");
  const reverseCn = valuesFor(effectCn, "DetailedDesc", reverseId).join(" ") || valuesFor(effectCn, "Desc", reverseId).join(" ");
  const sharedText = [directDesc, reverseDesc, directCn, reverseCn, valuesFor(effectKo, "ShortDesc", directId).join(" "), valuesFor(effectKo, "ShortDesc", reverseId).join(" ")].join(" ");
  const directShortCn = valuesFor(effectCn, "ShortDesc", directId).join("\n");
  const reverseShortCn = valuesFor(effectCn, "ShortDesc", reverseId).join("\n");
  const directShortKo = valuesFor(effectKo, "ShortDesc", directId);
  const reverseShortKo = valuesFor(effectKo, "ShortDesc", reverseId);
  const directShortValuesCn = valuesFor(effectCn, "ShortDesc", directId);
  const reverseShortValuesCn = valuesFor(effectCn, "ShortDesc", reverseId);
  const directAnalysis = analyzeEffect(`${directShortKo.join("\n")}\n${directDesc}`, `${directShortCn}\n${directCn}`, code, "direct", directShortKo, directShortValuesCn);
  const reverseAnalysis = analyzeEffect(`${reverseShortKo.join("\n")}\n${reverseDesc}`, `${reverseShortCn}\n${reverseCn}`, code, "reverse", reverseShortKo, reverseShortValuesCn);
  const equipType = readInteger(args[5], -1);
  const type = readInteger(args[6], -1);
  const sect = readInteger(args[9], -1);
  const element = readInteger(args[10], -1);
  const distanceAddition = readInteger(args[68], 0);
  const trickCost = resolveNeedTricks(args[69], id);
  const recommendedWeaponId = readInteger(args[72], -1);
  const fixedWeaponId = readInteger(args[73], -1);
  const recommendedWeapon = weaponById.get(recommendedWeaponId) || null;
  const fixedWeapon = weaponById.get(fixedWeaponId) || null;
  const weaponGroupId = fixedWeapon?.groupId ?? recommendedWeapon?.groupId ?? recommendedWeaponId;
  const weaponCandidates = weapons.filter((weapon) => fixedWeaponId >= 0 ? weapon.id === fixedWeaponId : weapon.groupId === weaponGroupId);
  const compatibleWeaponMap = new Map();
  if (trickCost.length > 0) {
    for (const weapon of weapons) {
      const covers = trickCost.every((cost) => weapon.tricks.filter((trickId) => trickId === cost.trickId).length >= Math.min(cost.count, 2));
      if (!covers || compatibleWeaponMap.has(weapon.groupId)) continue;
      compatibleWeaponMap.set(weapon.groupId, {
        groupId: weapon.groupId,
        representativeId: weapon.id,
        name: weapon.name,
        minDistance: weapon.minDistance,
        maxDistance: weapon.maxDistance + distanceAddition,
        tricks: weapon.tricks.map((trickId) => trickById.get(trickId)?.name || `식 ${trickId}`),
      });
    }
  }
  const rangeMin = weaponCandidates.length ? Math.min(...weaponCandidates.map((weapon) => weapon.minDistance)) : null;
  const rangeMax = weaponCandidates.length ? Math.max(...weaponCandidates.map((weapon) => weapon.maxDistance + distanceAddition)) : null;
  const requiredBodyParts = resolveNumberArray(args[62], id, "List<sbyte>");
  const specificGrids = resolveNumberArray(args[32], id, "sbyte[]").slice(0, 4);
  const injuryPartDistribution = resolveNumberArray(args[74], id, "sbyte[]");
  const hitPowerDistribution = resolveNumberArray(args[76], id, "sbyte[]");
  const outerDamageSteps = resolveNumberArray(args[114], id, "int[]");
  const innerDamageSteps = resolveNumberArray(args[115], id, "int[]");
  const propertyBonuses = resolvePropertyValues(args[113], id);
  const poisons = resolvePoisons(args[79], id);
  skills.push({
    id,
    name: combatKo.get(`Name_${id}`) || combatCn.get(`Name_${id}`) || `무공 ${id}`,
    nameCn: combatCn.get(`Name_${id}`) || "",
    lore: combatKo.get(`Desc_${id}`) || "",
    gradeIndex: readInteger(args[2], 0),
    grade: 9 - readInteger(args[2], 0),
    icon: unquote(args[4]),
    equipType,
    equipName: equipNames[equipType] || "기타",
    type,
    typeName: combatSkillTypeKo.get(`Name_${type}`) || `공법 유형 ${type}`,
    gridCost: readInteger(args[8], 1),
    masteredGridCost: Math.max(readInteger(args[8], 1) - 1, 1),
    specificGrids,
    genericGrid: readInteger(args[33], 0),
    sect,
    sectName: organizationKo.get(`Name_${sect}`) || `세력 ${sect}`,
    sectNameCn: organizationCn.get(`Name_${sect}`) || `Sect${sect}`,
    element,
    elementName: elementNames[element] || "무속성",
    direct: {
      effectId: directId,
      name: effectKo.get(`Name_${directId}`) || "정련",
      short: valuesFor(effectKo, "ShortDesc", directId),
      description: directDesc,
      tags: detectTags([directDesc, directCn].join(" "), code),
      analysis: directAnalysis,
    },
    reverse: {
      effectId: reverseId,
      name: effectKo.get(`Name_${reverseId}`) || "역련",
      short: valuesFor(effectKo, "ShortDesc", reverseId),
      description: reverseDesc,
      tags: detectTags([reverseDesc, reverseCn].join(" "), code),
      analysis: reverseAnalysis,
    },
    tags: detectTags(sharedText, code),
    codeClass: className,
    codeVerified: Boolean(code),
    combat: {
      distanceAddition,
      trickCost,
      recommendedWeaponId,
      recommendedWeaponName: recommendedWeapon?.name || null,
      recommendedWeaponNameCn: recommendedWeapon?.nameCn || null,
      fixedWeaponId,
      fixedWeaponName: fixedWeapon?.name || null,
      fixedWeaponNameCn: fixedWeapon?.nameCn || null,
      weaponGroupId,
      weaponCandidates: weaponCandidates.map((weapon) => weapon.id),
      compatibleWeaponGroups: [...compatibleWeaponMap.values()],
      minDistance: rangeMin,
      maxDistance: rangeMax,
      prepareProgress: readInteger(args[61], 0),
      requiredBodyParts,
      mobilityCost: readInteger(args[63], 0),
      breathStanceCost: readInteger(args[64], 0),
      baseInnerRatio: readInteger(args[65], 0),
      innerRatioChangeRange: readInteger(args[66], 0),
      penetrate: readInteger(args[67], 0),
      weaponDurabilityCost: readInteger(args[70], 0),
      wugCost: readInteger(args[71], 0),
      injuryPartDistribution,
      totalHit: readInteger(args[75], 0),
      hitPowerDistribution,
      hasAcupointEffect: /true/.test(args[77]),
      hasFlawEffect: /true/.test(args[78]),
      poisons,
      equipmentBreakOdds: readInteger(args[80], 0),
      addWugType: readInteger(args[81], -1),
      addMoveSpeedOnCast: readInteger(args[83], 0),
      addPercentMoveSpeedOnCast: readInteger(args[84], 0),
      moveCdBonus: readInteger(args[85], 0),
      mobilityReduceSpeed: readInteger(args[87], 0),
      mobilityAddSpeed: readInteger(args[88], 0),
      moveCostMobility: readInteger(args[89], 0),
      maxJumpDistance: readInteger(args[90], -1),
      jumpPrepareFrame: readInteger(args[91], -1),
      canPartlyJump: /true/.test(args[92]),
      fightBackDamage: readInteger(args[102], 0),
      bounceOuterInjury: readInteger(args[103], 0),
      bounceInnerInjury: readInteger(args[104], 0),
      continuousFrames: readInteger(args[105], 0),
      bounceDistance: readInteger(args[106], 0),
      propertyBonuses,
      outerDamageSteps,
      innerDamageSteps,
      fatalDamageStep: readInteger(args[116], 0),
      mindDamageStep: readInteger(args[117], 0),
    },
  });
}

skills.sort((a, b) => a.id - b.id);

const relationAudit = {
  evaluatedModePairs: 0,
  synergyCount: 0,
  counterCount: 0,
  rejectedOpponentHealingEdges: 0,
  missingEvidenceCount: 0,
};

function effectFor(skill, mode) {
  return skill[mode];
}

function edgeMatches(edge, verbs, target, resource = null) {
  return edge.confidence >= 2
    && verbs.includes(edge.verb)
    && edge.target === target
    && (resource === null || edge.resource === resource);
}

const broadRelationResources = new Set(["전투 상태", "피해", "부상", "표식", "진기", "식", "무공", "이동", "방어", "무기", "장비", "내구도", "강화 상태", "약화 상태"]);
function isSpecificRelationResource(resource) {
  return !broadRelationResources.has(resource);
}

function bestRelationCandidate() {
  let best = null;
  return {
    consider(score, reason, basis, resource, evidence) {
      if (!reason || !evidence || score <= (best?.score || 0)) return;
      best = { score, reason, basis, resource, evidence: evidence.slice(0, 220) };
    },
    result() { return best; },
  };
}

function evaluateSynergy(selected, selectedMode, candidate, candidateMode) {
  relationAudit.evaluatedModePairs += 1;
  const selectedEffect = effectFor(selected, selectedMode);
  const candidateEffect = effectFor(candidate, candidateMode);
  const aEdges = selectedEffect.analysis.semanticEdges;
  const bEdges = candidateEffect.analysis.semanticEdges;
  const best = bestRelationCandidate();
  const supplies = ["produces", "amplifies"];
  const needs = ["requires", "consumes", "amplifies"];

  for (const supply of aEdges.filter((edge) => edgeMatches(edge, supplies, "자신") && edge.valence === "이로운 상태" && isSpecificRelationResource(edge.resource))) {
    const need = bEdges.find((edge) => edgeMatches(edge, needs, "자신", supply.resource));
    if (need) best.consider(46, `선택 공법이 공급하는 「${supply.resource}」을 이 공법의 발동·소모 조건으로 직접 사용`, "resource-chain", supply.resource, `${supply.evidence} / ${need.evidence}`);
  }
  for (const supply of bEdges.filter((edge) => edgeMatches(edge, supplies, "자신") && edge.valence === "이로운 상태" && isSpecificRelationResource(edge.resource))) {
    const need = aEdges.find((edge) => edgeMatches(edge, needs, "자신", supply.resource));
    if (need) best.consider(48, `이 공법이 공급하는 「${supply.resource}」으로 선택 공법의 발동·소모 조건을 완성`, "resource-chain", supply.resource, `${supply.evidence} / ${need.evidence}`);
  }
  for (const supply of aEdges.filter((edge) => edgeMatches(edge, supplies, "적") && edge.valence === "해로운 상태" && isSpecificRelationResource(edge.resource))) {
    const follow = bEdges.find((edge) => edgeMatches(edge, needs, "적", supply.resource));
    if (follow) best.consider(50, `선택 공법이 적에게 남기는 「${supply.resource}」을 이 공법이 조건·소모·증폭에 사용`, "offense-chain", supply.resource, `${supply.evidence} / ${follow.evidence}`);
    const sameStack = bEdges.find((edge) => edgeMatches(edge, supplies, "적", supply.resource));
    if (sameStack) best.consider(27, `두 공법이 적의 「${supply.resource}」 축적을 같은 대상에 누적`, "offense-stack", supply.resource, `${supply.evidence} / ${sameStack.evidence}`);
  }
  for (const supply of bEdges.filter((edge) => edgeMatches(edge, supplies, "적") && edge.valence === "해로운 상태" && isSpecificRelationResource(edge.resource))) {
    const follow = aEdges.find((edge) => edgeMatches(edge, needs, "적", supply.resource));
    if (follow) best.consider(52, `이 공법이 적에게 만드는 「${supply.resource}」을 선택 공법이 조건·소모·증폭에 사용`, "offense-chain", supply.resource, `${supply.evidence} / ${follow.evidence}`);
  }

  const selectedDirection = selectedEffect.tags.includes("전진") ? "전진" : selectedEffect.tags.includes("후진") ? "후진" : null;
  if (selectedEffect.tags.includes("자동발동") && selectedDirection && candidate.equipType === 2 && candidateEffect.tags.includes(selectedDirection)) {
    best.consider(45, `${selectedDirection} 신법 이동이 선택 공법의 자동발동 조건을 직접 만든다`, "movement-trigger", selectedDirection, candidateEffect.description || candidateEffect.short.join(" "));
  }
  const candidateDirection = candidateEffect.tags.includes("전진") ? "전진" : candidateEffect.tags.includes("후진") ? "후진" : null;
  if (candidateEffect.tags.includes("자동발동") && candidateDirection && selected.equipType === 2 && selectedEffect.tags.includes(candidateDirection)) {
    best.consider(43, `선택 신법의 ${candidateDirection} 이동이 이 공법의 자동발동 조건을 직접 만든다`, "movement-trigger", candidateDirection, selectedEffect.description || selectedEffect.short.join(" "));
  }

  const candidateMakesTrick = bEdges.find((edge) => edgeMatches(edge, supplies, "자신", "식"));
  const candidateMechanicText = [candidateEffect.description, ...candidateEffect.short, ...candidateEffect.analysis.mechanicAxes, ...candidateEffect.analysis.mechanicLabels].join(" ");
  const suppliedTrick = selected.combat.trickCost.find((cost) => candidateMechanicText.includes(cost.name) || (cost.nameCn && candidateMechanicText.includes(cost.nameCn)));
  if (candidateMakesTrick && suppliedTrick) {
    best.consider(42, `시전에 필요한 「${suppliedTrick.name}」 식을 직접 추가·변환해 준비 시간을 단축`, "trick-supply", suppliedTrick.name, candidateMakesTrick.evidence);
  }
  const selectedPoisons = selected.combat.poisons.filter((poison) => !poison.name.includes("등급")).map((poison) => poison.name);
  const sharedPoison = candidate.combat.poisons.find((poison) => !poison.name.includes("등급") && selectedPoisons.includes(poison.name));
  if (sharedPoison && selectedEffect.tags.includes("독") && candidateEffect.tags.includes("독")) {
    best.consider(34, `같은 「${sharedPoison.name}」 축적·발작 계통을 이어 독 발동 조건을 안정화`, "poison-system", sharedPoison.name, candidateEffect.description || candidateEffect.short.join(" "));
  }
  const candidateExtendsRange = bEdges.find((edge) => edgeMatches(edge, supplies, "자신", "공격 거리"));
  if (candidateExtendsRange && selected.combat.maxDistance !== null) {
    best.consider(34, `선택 공법의 기본 사거리 ${(selected.combat.minDistance ?? 0) / 10}–${selected.combat.maxDistance / 10}를 늘려 무기 거리 상성을 보정`, "range-extension", "공격 거리", candidateExtendsRange.evidence);
  }
  if (selectedEffect.analysis.mechanicAxes.includes(candidate.sectNameCn)) {
    best.consider(44, `효과가 지정한 「${candidate.sectName}」 공법이라 위력·상한 보정을 직접 받음`, "sect-rule", candidate.sectName, selectedEffect.description || selectedEffect.short.join(" "));
  }
  const candidateWeaponNameCn = candidate.combat.fixedWeaponNameCn || candidate.combat.recommendedWeaponNameCn;
  if (candidateWeaponNameCn && selectedEffect.analysis.mechanicAxes.includes(candidateWeaponNameCn)) {
    best.consider(44, `효과가 지정한 무기 「${candidate.combat.fixedWeaponName || candidate.combat.recommendedWeaponName}」를 사용하는 공법`, "weapon-rule", candidate.combat.fixedWeaponName || candidate.combat.recommendedWeaponName, selectedEffect.description || selectedEffect.short.join(" "));
  }
  return best.result();
}

function evaluateCounter(selected, selectedMode, candidate, candidateMode) {
  const selectedEffect = effectFor(selected, selectedMode);
  const candidateEffect = effectFor(candidate, candidateMode);
  const aEdges = selectedEffect.analysis.semanticEdges;
  const bEdges = candidateEffect.analysis.semanticEdges;
  const best = bestRelationCandidate();
  const inverse = ["clears", "reduces", "prevents", "consumes"];
  const supplies = ["produces", "amplifies"];

  for (const output of aEdges.filter((edge) => edgeMatches(edge, supplies, "적") && edge.valence === "해로운 상태" && isSpecificRelationResource(edge.resource))) {
    const defense = bEdges.find((edge) => edgeMatches(edge, inverse, "자신", output.resource));
    if (defense) best.consider(52, `선택 공법이 적에게 만드는 「${output.resource}」을 자신에게서 제거·감소·차단`, "defensive-inverse", output.resource, `${output.evidence} / ${defense.evidence}`);
  }
  for (const benefit of aEdges.filter((edge) => edgeMatches(edge, supplies, "자신") && edge.valence === "이로운 상태" && isSpecificRelationResource(edge.resource))) {
    const denial = bEdges.find((edge) => edgeMatches(edge, inverse, "적", benefit.resource));
    if (denial) best.consider(54, `선택 공법이 자신에게 부여하는 「${benefit.resource}」을 적에게서 제거·감소·차단`, "buff-denial", benefit.resource, `${benefit.evidence} / ${denial.evidence}`);
  }
  for (const requirement of aEdges.filter((edge) => edgeMatches(edge, ["requires", "consumes"], "자신") && edge.valence === "이로운 상태" && isSpecificRelationResource(edge.resource))) {
    const denial = bEdges.find((edge) => edgeMatches(edge, inverse, "적", requirement.resource));
    if (denial) best.consider(56, `핵심 발동 자원 「${requirement.resource}」을 적에게서 빼앗거나 차단`, "requirement-denial", requirement.resource, `${requirement.evidence} / ${denial.evidence}`);
  }

  if (selectedEffect.tags.includes("현재부상만")) {
    const oldInjury = bEdges.find((edge) => edgeMatches(edge, supplies, "적", "오래된 부상"));
    if (oldInjury) best.consider(64, "회복 대상에서 제외되는 오래된 부상을 적에게 만들어 현재 부상 정화·불사 루프를 우회", "old-injury-bypass", "오래된 부상", oldInjury.evidence);
  }
  if (selected.combat.maxDistance !== null && candidate.equipType === 1 && candidate.combat.maxDistance !== null && candidate.combat.maxDistance >= selected.combat.maxDistance + 20) {
    best.consider(30 + Math.min(10, Math.floor((candidate.combat.maxDistance - selected.combat.maxDistance) / 10)), `${candidate.combat.maxDistance / 10} 거리에서 공격해 선택 공법의 ${selected.combat.maxDistance / 10} 최대 사거리 밖을 유지`, "range-control", "공격 거리", `${candidate.combat.fixedWeaponName || candidate.combat.recommendedWeaponName || candidate.typeName} · ${candidate.combat.maxDistance / 10}`);
  }
  return best.result();
}

function buildRelations(selected, selectedMode, evaluator, minimumScore) {
  const relations = [];
  for (const candidate of skills) {
    if (candidate.id === selected.id) continue;
    let best = null;
    for (const candidateMode of ["direct", "reverse"]) {
      const result = evaluator(selected, selectedMode, candidate, candidateMode);
      if (result && result.score >= minimumScore && result.score > (best?.score || 0)) best = { ...result, skillId: candidate.id, mode: candidateMode };
    }
    if (best) relations.push(best);
  }
  const sorted = relations.sort((a, b) => b.score - a.score || a.skillId - b.skillId);
  const perBasis = new Map();
  const diversified = [];
  for (const relation of sorted) {
    const count = perBasis.get(relation.basis) || 0;
    if (count >= 4) continue;
    perBasis.set(relation.basis, count + 1);
    diversified.push(relation);
    if (diversified.length >= 20) break;
  }
  return diversified;
}

for (const skill of skills) {
  skill.relations = {};
  for (const mode of ["direct", "reverse"]) {
    const synergy = buildRelations(skill, mode, evaluateSynergy, 27);
    const counter = buildRelations(skill, mode, evaluateCounter, 30);
    relationAudit.synergyCount += synergy.length;
    relationAudit.counterCount += counter.length;
    relationAudit.missingEvidenceCount += [...synergy, ...counter].filter((relation) => !relation.evidence).length;
    skill.relations[mode] = { synergy, counter };
  }
}

const allAnalyses = skills.flatMap((skill) => [skill.direct.analysis, skill.reverse.analysis]);
relationAudit.rejectedOpponentHealingEdges = allAnalyses.reduce((sum, analysis) => sum + analysis.semanticEdges.filter((edge) =>
  edge.confidence >= 2
  && ["clears", "reduces", "prevents", "consumes"].includes(edge.verb)
  && edge.target === "적"
  && edge.valence === "해로운 상태"
).length, 0);
const countUnique = (field) => new Set(allAnalyses.flatMap((analysis) => analysis[field])).size;
const digest = createHash("sha256");
for (const path of [sharedDll, gameDll, clientDll, join(languageKo, "CombatSkill_language.txt"), join(languageKo, "SpecialEffect_language.txt"), ...overlayFiles("CombatSkill_language.txt"), ...overlayFiles("SpecialEffect_language.txt")]) {
  digest.update(readFileSync(path));
}

const payload = {
  meta: {
    schemaVersion: 4,
    datasetVersion,
    gameVersion,
    steamBuildId,
    localizationMods: localizationMods.map(({ name, version }) => ({ name, version })),
    extractedAt: new Date().toISOString(),
    sourceHash: digest.digest("hex"),
    gameRootName: basename(gameRoot),
    sharedDllModifiedAt: statSync(sharedDll).mtime.toISOString(),
    skillCount: skills.length,
    codeAnalysis: withCode,
    analysisStats: {
      effectCount: allAnalyses.length,
      mechanicAxisCount: countUnique("mechanicAxes"),
      conceptCount: countUnique("concepts"),
      triggerCount: countUnique("triggers"),
      codeEventCount: countUnique("codeEvents"),
      codeSignalCount: countUnique("codeSignals"),
      codeLogicOperationCount: allAnalyses.reduce((sum, analysis) => sum + analysis.logic.operations.length, 0),
      codeLogicConditionCount: allAnalyses.reduce((sum, analysis) => sum + analysis.logic.conditions.length, 0),
      codeLogicCoveredEffectCount: allAnalyses.filter((analysis) => analysis.logic.events.length || analysis.logic.conditions.length || analysis.logic.operations.length).length,
      affectedFieldCount: affectedFields.length,
      weaponCount: weapons.length,
      trickTypeCount: tricks.length,
      semanticEdgeCount: allAnalyses.reduce((sum, analysis) => sum + analysis.semanticEdges.length, 0),
    },
    relationAudit,
  },
  tricks,
  weapons,
  affectedFields,
  ui: uiProfile,
  skills,
};

const shardCount = 8;
const shardSize = Math.ceil(skills.length / shardCount);
const outputStem = outputFile.endsWith(".json") ? outputFile.slice(0, -5) : outputFile;
const manifest = { ...payload, meta: { ...payload.meta, skillShardCount: shardCount } };
delete manifest.skills;
writeFileSync(outputFile, `${JSON.stringify(manifest)}\n`, "utf8");
for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
  const shard = skills.slice(shardIndex * shardSize, (shardIndex + 1) * shardSize);
  writeFileSync(`${outputStem}-${shardIndex}.json`, `${JSON.stringify(shard)}\n`, "utf8");
}
if (portableFile) {
  const portableOutput = resolve(portableFile);
  mkdirSync(dirname(portableOutput), { recursive: true });
  writeFileSync(portableOutput, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`업로드용 데이터: ${portableOutput}`);
}
console.log(`추출 완료: ${skills.length}개 무공 -> ${outputFile}`);
