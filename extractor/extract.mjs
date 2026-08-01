#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultGame = process.platform === "win32"
  ? "H:\\SteamLibrary\\steamapps\\common\\The Scroll Of Taiwu"
  : "";
const gameRoot = resolve(valueOf("--game", process.env.TAIWU_GAME_DIR || defaultGame));
const outputFile = resolve(valueOf("--out", join(projectRoot, "app", "data", "combat-skills.json")));
const cacheRoot = resolve(valueOf("--cache", join(projectRoot, "extractor", ".cache")));
const withCode = !argv.includes("--no-code");

const backend = join(gameRoot, "Backend");
const sharedDll = join(backend, "GameData.Shared.dll");
const gameDll = join(backend, "GameData.dll");
const stream = join(gameRoot, "The Scroll of Taiwu_Data", "StreamingAssets");
const languageKo = join(stream, "Language_KO");
const languageCn = join(stream, "Language_CN");

for (const path of [sharedDll, gameDll, languageKo, languageCn]) {
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
const codeRoot = withCode ? decompileCode() : null;
const combatKo = readPairs(join(languageKo, "CombatSkill_language.txt"));
const combatCn = readPairs(join(languageCn, "CombatSkill_language.txt"));
const effectKo = readPairs(join(languageKo, "SpecialEffect_language.txt"));
const effectCn = readPairs(join(languageCn, "SpecialEffect_language.txt"));
const weaponKo = readPairs(join(languageKo, "Weapon_language.txt"));
const weaponCn = readPairs(join(languageCn, "Weapon_language.txt"));
const trickKo = readPairs(join(languageKo, "TrickType_language.txt"));
const trickCn = readPairs(join(languageCn, "TrickType_language.txt"));
const dataFieldKo = readPairs(join(languageKo, "SpecialEffectDataField_language.txt"));
const dataFieldCn = readPairs(join(languageCn, "SpecialEffectDataField_language.txt"));

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

function codeFor(className) {
  if (!codeRoot || !className || className === "null") return "";
  const path = join(codeRoot, "GameData", "Domains", "SpecialEffect", ...className.split(".")) + ".cs";
  return existsSync(path) ? readFileSync(path, "utf8") : "";
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
  ["최파 진기", /摧破真气|최파 진기/i],
  ["경령 진기", /轻灵真气|경령 진기/i],
  ["호체 진기", /护体真气|호체 진기/i],
  ["기규 진기", /奇窍.*真气|기규.*진기/i],
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
  ["최파 무공", /摧破功法|최파.*무공/i],
  ["경령 무공", /轻灵功法|경령.*무공|경공/i],
  ["호체 무공", /护体功法|호체.*무공/i],
  ["기규 무공", /奇窍功法|기규.*무공/i],
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
  prevents: /禁止|无法|免受|免于|无效|无视|抵消|不可|不会|금지|불가|면역|무효|무시|방지/i,
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

function analyzeEffect(textKo, textCn, code, shortKo = [], shortCn = []) {
  const text = `${textCn} ${textKo}`;
  const concepts = matchedConcepts(text);
  const triggers = triggerRules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const buckets = { produces: [], consumes: [], clears: [], amplifies: [], reduces: [], prevents: [], requires: [] };
  const clauses = text.split(/[；;。.!！?？\n]/).filter(Boolean);
  for (const clause of clauses) {
    const clauseConcepts = matchedConcepts(clause);
    for (const [bucket, pattern] of Object.entries(actionRules)) {
      if (pattern.test(clause)) buckets[bucket].push(...clauseConcepts);
    }
  }
  const unique = (values) => [...new Set(values)];
  const codeEvents = unique([...code.matchAll(/RegisterHandler_([A-Za-z0-9_]+)/g)].map((match) => match[1]));
  const codeSignals = unique([...code.matchAll(/\b(?:DomainManager\.[A-Za-z0-9_.]+\.)?((?:Add|Change|Remove|Clear|Cost|Use|Cast|Move|Damage|Injur|Poison|Trick|Weapon|CombatSkill|Mark|Defeat|Flaw|Acupoint|Disorder|Stance|Breath)[A-Za-z0-9_]{3,})\s*\(/g)].map((match) => match[1])).slice(0, 60);
  const affectedFieldIds = unique([
    ...[...code.matchAll(/CreateAffectedData\(\s*(\d+)/g)].map((match) => Number(match[1])),
    ...[...code.matchAll(/FieldId\s*==\s*(\d+)/g)].map((match) => Number(match[1])),
    ...[...code.matchAll(/InvalidateCache\([^;\n]*?,\s*(\d+)\s*\)/g)].map((match) => Number(match[1])),
  ]);
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
    codeSignals,
    affectedFields: affectedFieldIds.map((fieldId) => affectedFieldById.get(fieldId)?.name || `전투 필드 ${fieldId}`),
    affectedFieldIds,
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

const equipNames = ["내공", "최파", "경공", "호체", "기규"];
const typeNames = ["내공", "권장", "지법", "퇴법", "암기", "검법", "도법", "장병", "기문", "연병", "음률", "어사", "경공", "호체·기규"];
const elementNames = ["금", "목", "수", "화", "토", "혼원"];
const sectNames = ["무문무파", "소림파", "아미파", "백화곡", "무당파", "연산파", "복룡단", "주검산장", "사상문", "공상파", "오선교", "현녀파", "혈후교", "계청문", "원산파"];
const sectNamesCn = ["无门无派", "少林派", "峨眉派", "百花谷", "武当派", "然山派", "伏龙坛", "铸剑山庄", "狮相门", "空桑派", "五仙教", "璇女派", "血犼教", "界青门", "元山派"];

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
  const directShortCn = valuesFor(effectCn, "ShortDesc", directId).join(" ");
  const reverseShortCn = valuesFor(effectCn, "ShortDesc", reverseId).join(" ");
  const directShortKo = valuesFor(effectKo, "ShortDesc", directId);
  const reverseShortKo = valuesFor(effectKo, "ShortDesc", reverseId);
  const directShortValuesCn = valuesFor(effectCn, "ShortDesc", directId);
  const reverseShortValuesCn = valuesFor(effectCn, "ShortDesc", reverseId);
  const directAnalysis = analyzeEffect(`${directShortKo.join(" ")} ${directDesc}`, `${directShortCn} ${directCn}`, code, directShortKo, directShortValuesCn);
  const reverseAnalysis = analyzeEffect(`${reverseShortKo.join(" ")} ${reverseDesc}`, `${reverseShortCn} ${reverseCn}`, code, reverseShortKo, reverseShortValuesCn);
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
    grade: readInteger(args[2], 0) + 1,
    icon: unquote(args[4]),
    equipType,
    equipName: equipNames[equipType] || "기타",
    type,
    typeName: typeNames[type] || "기타",
    gridCost: readInteger(args[8], 1),
    sect,
    sectName: sectNames[sect] || `세력 ${sect}`,
    sectNameCn: sectNamesCn[sect] || `Sect${sect}`,
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
const allAnalyses = skills.flatMap((skill) => [skill.direct.analysis, skill.reverse.analysis]);
const countUnique = (field) => new Set(allAnalyses.flatMap((analysis) => analysis[field])).size;
const digest = createHash("sha256");
for (const path of [sharedDll, gameDll, join(languageKo, "CombatSkill_language.txt"), join(languageKo, "SpecialEffect_language.txt")]) {
  digest.update(readFileSync(path));
}

const payload = {
  meta: {
    schemaVersion: 1,
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
      affectedFieldCount: affectedFields.length,
      weaponCount: weapons.length,
      trickTypeCount: tricks.length,
    },
  },
  tricks,
  weapons,
  affectedFields,
  skills,
};

writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`추출 완료: ${skills.length}개 무공 -> ${outputFile}`);
