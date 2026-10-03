const resourceRules = [
  ["오래된 부상", /OldInjur|OldWound/i],
  ["외상", /OuterInjur|OuterDamage/i],
  ["내상", /InnerInjur|InnerDamage/i],
  ["부상", /Injur|Wound/i],
  ["파열", /Flaw/i],
  ["봉혈", /Acupoint/i],
  ["실신", /MindMark|MindDamage|DamageMind/i],
  ["필사 표식", /FatalMark|FatalDamage|EMarkType\.Fatal/i],
  ["패배 표식", /DefeatMark|AboutToFall/i],
  ["독", /Poison/i],
  ["고독", /Wug|GuEffect/i],
  ["내식 문란", /Disorder|InternalInjury/i],
  ["자세", /Stance/],
  ["호흡", /Breath|TeQi/i],
  ["신법", /Mobility|Agile/i],
  ["진기", /NeiliAllocation|Neili|QiAllocation/i],
  ["식", /Trick/i],
  ["무기 내구도", /WeaponDurability/i],
  ["무기", /Weapon/i],
  ["방어구", /Armor|ProtectiveGear/i],
  ["장비", /Equipment|EquipItem/i],
  ["공격 거리", /AttackDistance|AttackRange|CombatDistance|Distance/i],
  ["전진", /MoveForward|ForwardMove/i],
  ["후진", /MoveBackward|BackwardMove|Retreat/i],
  ["이동 속도", /MoveSpeed/i],
  ["이동", /(?:^|[^A-Za-z])Move|Jump/i],
  ["명중", /HitValue|HitRate|HitResult|AttackHit/i],
  ["회피·파해", /Avoid|Dodge|Evade|Deflect/i],
  ["파체", /PenetrateBody|BreakBody/i],
  ["파기", /PenetrateQi|BreakQi/i],
  ["방어", /Defense|Protect|Guard/i],
  ["직접 피해", /DirectDamage/i],
  ["피해", /Damage|Hurt/i],
  ["반격·반사", /FightBack|CounterAttack|Bounce|Reflect/i],
  ["무공 위력", /SkillPower|CombatSkillPower|PowerEffect/i],
  ["시전 진행", /CastProgress|PrepareProgress/i],
  ["시전 속도", /CastSpeed|PrepareSpeed/i],
  ["공격 속도", /AttackSpeed/i],
  ["추격", /Pursue/i],
  ["무공", /CombatSkill/i],
  ["표식", /Mark/i],
  ["강화 상태", /Buff|PositiveState/i],
  ["약화 상태", /Debuff|NegativeState/i],
  ["봉금", /Ban(?:ned|able)?Skill|SealSkill|SilenceSkill|SkillCd/i],
  ["오행", /FiveElement/i],
];

const eventRules = [
  ["전투 시작", /CombatStart|EnterCombat/i],
  ["패배 임계", /AboutToFall|ReachFail|DefeatMarkReach/i],
  ["시전 시작", /Prepare|CastStart|SkillStart/i],
  ["시전 완료", /CastEnd|SkillEnd|ReleaseSkill/i],
  ["공격 명중", /AttackHit|HitEnemy|HitTarget/i],
  ["공격 빗나감", /AttackMiss|NotHit/i],
  ["피격", /BeHit|AcceptDamage|TakeDamage|ReceiveDamage/i],
  ["직접 피해 발생", /DirectDamage/i],
  ["무기 교체", /WeaponChanged|ChangeWeapon|SwitchWeapon/i],
  ["이동", /Move|Jump/i],
  ["전진", /Forward/i],
  ["후진", /Backward|Retreat/i],
  ["추격", /Pursue/i],
  ["표식 발생", /Mark/i],
  ["부상 발생", /Injur/i],
  ["독 발작", /Poison/i],
  ["시간 경과", /Tick|Update|Time|Frame/i],
  ["무공 전환", /SkillChanged|SwitchSkill/i],
];

const ignoredCalls = new Set(["if", "for", "foreach", "while", "switch", "return", "sizeof", "typeof", "nameof", "checked", "unchecked", "lock", "using"]);

function unique(values) {
  return [...new Set(values)];
}

function balancedEnd(source, start, open = "(", close = ")") {
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') quote = true;
    else if (character === open) depth += 1;
    else if (character === close && --depth === 0) return index;
  }
  return -1;
}

export function selectModeCode(source, mode) {
  let selected = source;
  const branchPattern = /if\s*\(\s*(!?)\s*(?:base\.)?(IsDirect|IsReverse)\s*\)\s*\{/g;
  for (let pass = 0; pass < 8; pass += 1) {
    const replacements = [];
    branchPattern.lastIndex = 0;
    let match;
    while ((match = branchPattern.exec(selected))) {
      const openBrace = selected.indexOf("{", match.index);
      const closeBrace = balancedEnd(selected, openBrace, "{", "}");
      if (closeBrace < 0) continue;
      let tail = closeBrace + 1;
      while (/\s/.test(selected[tail] || "")) tail += 1;
      let elseBody = "";
      if (selected.slice(tail, tail + 4) === "else") {
        const elseOpen = selected.indexOf("{", tail + 4);
        if (elseOpen >= 0) {
          const elseClose = balancedEnd(selected, elseOpen, "{", "}");
          if (elseClose >= 0) {
            elseBody = selected.slice(elseOpen + 1, elseClose);
            tail = elseClose + 1;
          }
        }
      }
      const positiveDirect = match[2] === "IsDirect" ? match[1] !== "!" : match[1] === "!";
      const takeTrue = mode === "direct" ? positiveDirect : !positiveDirect;
      const trueBody = selected.slice(openBrace + 1, closeBrace);
      replacements.push({ start: match.index, end: tail, value: takeTrue ? trueBody : elseBody });
      branchPattern.lastIndex = tail;
    }
    if (!replacements.length) break;
    for (const replacement of replacements.reverse()) {
      selected = selected.slice(0, replacement.start) + replacement.value + selected.slice(replacement.end);
    }
  }
  return selected;
}

function resourcesFor(text) {
  return unique(resourceRules.filter(([, pattern]) => pattern.test(text)).map(([resource]) => resource));
}

function targetFor(text) {
  const self = /base\.CombatChar|\bCombatChar\b|Self|self|Owner|owner|Caster|caster|Attacker|attacker/i.test(text);
  const enemy = /Enemy|enemy|Opponent|opponent|Target|target|Defender|defender/i.test(text);
  if (self && enemy) return "양측";
  if (enemy) return "적";
  if (self) return "자신";
  return "전투 상태";
}

function verbFor(symbol, snippet) {
  // Event wiring and cache invalidation are not combat state mutations.
  if (/RegisterHandler|UnRegisterHandler|PostDataModificationHandler|Invalid.*Cache|InvalidateCache/i.test(symbol)) return null;
  // Queries only discover bannable skills; the actual state change is made by
  // SilenceSkill/ClearSkillCd. Treating every "Banable" getter as a prevention
  // operation used to turn unrelated DisableJumpMove calls into false 봉금
  // counters.
  if (/^(?:Get|Is|Can|TryGet).*Ban(?:ned|able)?Skill/i.test(symbol)) return null;
  if (/SilenceSkill|SealSkill/i.test(symbol)) return "produces";
  if (/Subtract/i.test(symbol) && /GetOldInjuries|OldInjur/i.test(snippet)) return "filters";
  if (/Remove|Clear|Erase|Erasure|Delete|Cure|Dispel|Cancel|Clean/i.test(symbol)) return "clears";
  if (/Prevent|Block|Ignore|Immune|Disable|Ban|Seal|Invalid/i.test(symbol)) return "prevents";
  if (/Cost|Consume|Spend|Expend|Drain|Subtract|Deduct/i.test(symbol)) return "consumes";
  if (/Reduce|Decrease|Lower|Weaken|Shorten/i.test(symbol)) return "reduces";
  if (/Boost|Enhance|Amplif|Increase|Raise|Extend|Accelerate|Worsen/i.test(symbol)) return "amplifies";
  if (/Add|Create|Generate|Apply|Gain|Recover|Heal|Attach|Award|Spawn|Inflict/i.test(symbol)) return "produces";
  if (/Change|Set|Modify|Update|Convert|Transform/i.test(symbol)) {
    if (/[-]\s*(?:\d|[A-Za-z_])|-=|Subtract/i.test(snippet)) return "reduces";
    if (/[+]\s*\d|\+=|Increase/i.test(snippet)) return "amplifies";
    return "modifies";
  }
  return null;
}

function expressionSnippet(source, start, maxLength = 320) {
  const endCandidates = [source.indexOf(";", start), source.indexOf("\n", start)].filter((index) => index >= start);
  const end = Math.min(...(endCandidates.length ? endCandidates : [start + maxLength]), start + maxLength);
  return source.slice(start, end + 1).replace(/\s+/g, " ").trim();
}

export function extractCodeLogic(source, mode) {
  if (!source) return { mode, events: [], conditions: [], operations: [], symbols: [], affectedFieldIds: [], coverage: { eventCount: 0, conditionCount: 0, operationCount: 0, symbolCount: 0 } };
  const code = selectModeCode(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/(?! inheritance:).*$/gm, ""), mode);
  const inheritanceMarkers = [...code.matchAll(/inheritance:(\d+):([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => ({ index: match.index, depth: Number(match[1]), owner: match[2] }));
  const provenanceAt = (index) => {
    let result = { depth: 0, owner: "effect" };
    for (const marker of inheritanceMarkers) {
      if (marker.index > index) break;
      result = { depth: marker.depth, owner: marker.owner };
    }
    return result;
  };
  const events = [...code.matchAll(/\bRegisterHandler_([A-Za-z0-9_]+)/g)].map((match) => {
    const name = match[1];
    return { name, label: eventRules.find(([, pattern]) => pattern.test(name))?.[0] || "코드 이벤트", ...provenanceAt(match.index) };
  });

  const conditions = [];
  const conditionPattern = /\bif\s*\(/g;
  let conditionMatch;
  while ((conditionMatch = conditionPattern.exec(code))) {
    const open = code.indexOf("(", conditionMatch.index);
    const close = balancedEnd(code, open);
    if (close < 0) continue;
    const expression = code.slice(open + 1, close).replace(/\s+/g, " ").trim().slice(0, 260);
    const resources = resourcesFor(expression);
    const enumStates = unique([...expression.matchAll(/\bE[A-Za-z0-9_]+\.([A-Za-z0-9_]+)/g)].map((match) => match[1]));
    if (resources.length || enumStates.length || /CanAffect|IsDirect|Reach|Count|Value|Percent|Distance/i.test(expression)) {
      conditions.push({
        expression,
        resources,
        states: enumStates,
        target: targetFor(expression),
        polarity: /!|==\s*(?:false|null)|<=\s*0/.test(expression) ? "guard" : "requires",
        ...provenanceAt(conditionMatch.index),
      });
    }
    conditionPattern.lastIndex = close + 1;
  }

  const symbols = [];
  const operations = [];
  const operationTarget = (symbol, snippet, index) => {
    const marker = [...inheritanceMarkers].reverse().find((item) => item.index <= index);
    const preceding = code.slice(marker?.index || 0, index);
    const methods = [...preceding.matchAll(/(?:public|private|protected|internal)[^;{}\n]*\([^;{}\n]*\)\s*\{/g)];
    const method = methods.at(-1);
    const scope = preceding.slice(method?.index || 0);
    const aliases = new Map();
    for (const match of scope.matchAll(/(?:CombatCharacter|var)\s+(\w+)\s*=\s*([^;]+);/g)) {
      const expression = match[2];
      let target = /GetCombatCharacter\(\s*!|CurrEnemyChar|_enemyChar/.test(expression) ? "적"
        : /(?:EffectBase\.)?CombatChar\b|_selfChar/.test(expression) ? "자신" : targetFor(expression);
      if (target === "전투 상태") target = aliases.get(expression.trim()) || target;
      aliases.set(match[1], target);
    }
    // Known mutation signatures: the attacker argument is not the recipient.
    const argumentsText = snippet.slice(snippet.indexOf("(") + 1);
    const args = argumentsText.split(",");
    const destinationIndex = /^(?:AddPoison|HealInjuryInCombat|HealPoisonInCombat)$/.test(symbol) ? 2
      : /^(?:AddPowerDamageMind|SilenceSkill|AddFlaw|AddAcupoint|ChangeBreathValue|ChangeStanceValue|ChangeMobilityValue|ChangeDistance)$/.test(symbol) ? 1 : -1;
    const receiver = destinationIndex >= 0 && /^context\s*$/.test(args[0]?.trim()) && args[destinationIndex]
      ? args[destinationIndex].trim() : snippet.slice(0, snippet.indexOf("(")).replace(/\.\w+$/, "").trim();
    return receiver ? aliases.get(receiver) || targetFor(receiver) : targetFor(snippet);
  };
  const callPattern = /\b((?:base\.|DomainManager\.[A-Za-z0-9_.]+\.|[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*))\s*\(/g;
  let call;
  while ((call = callPattern.exec(code))) {
    const symbol = call[2];
    if (ignoredCalls.has(symbol)) continue;
    const lineStart = code.lastIndexOf("\n", call.index) + 1;
    const declarationPrefix = code.slice(lineStart, call.index);
    if (/\b(?:public|private|protected|internal|static|override|virtual|sealed|unsafe|async)\b/.test(declarationPrefix)) continue;
    if (!call[1].includes(".") && /^\s*[A-Za-z_][A-Za-z0-9_<>,?\[\]]*\s+$/.test(declarationPrefix)) continue;
    symbols.push(symbol);
    const snippet = expressionSnippet(code, call.index);
    let verb = verbFor(symbol, snippet);
    if (!verb) continue;
    if (/_[A-Za-z0-9_]*(?:Pool|List|Dict|Collection|Cache|Temp)[A-Za-z0-9_]*\.(?:Add|AddRange|Remove|RemoveAt|Clear|Reset|Set)/i.test(snippet)) continue;
    if (/^(?:Generate|Create|Add).*(?:Pool|List|Dictionary|Cache)$/i.test(symbol)) continue;
    const resources = resourcesFor(`${symbol} ${snippet}`);
    if (/Injury/.test(symbol) && /inner:\s*true/.test(snippet)) resources.push("내상");
    if (/Injury/.test(symbol) && /inner:\s*false/.test(snippet)) resources.push("외상");
    if (verb === "reduces" && /Change|Cost|Use/i.test(symbol) && resources.some((resource) => ["진기", "자세", "호흡", "신법", "식", "무기 내구도"].includes(resource))) verb = "consumes";
    const numericValues = unique([...snippet.matchAll(/(?<![A-Za-z_])-?\d+(?:\.\d+)?/g)].map((match) => match[0])).slice(0, 8);
    if (!resources.length && /^(?:Add|AddRange|Remove|RemoveAt|Clear|Reset|Set|Change|Update|Create|Generate)$/i.test(symbol)) continue;
    operations.push({
      symbol,
      verb,
      resources: resources.length ? resources : ["전투 상태"],
      target: operationTarget(symbol, snippet, call.index),
      values: numericValues,
      evidence: snippet.slice(0, 220),
      ...provenanceAt(call.index),
    });
  }

  const affectedFieldOccurrences = [
    ...[...code.matchAll(/CreateAffected(?:AllEnemy)?Data\(\s*(\d+)/g)].map((match) => ({ fieldId: Number(match[1]), ...provenanceAt(match.index) })),
    ...[...code.matchAll(/FieldId\s*==\s*(\d+)/g)].map((match) => ({ fieldId: Number(match[1]), ...provenanceAt(match.index) })),
    ...[...code.matchAll(/InvalidateCache\([^;\n]*?,\s*(\d+)\s*\)/g)].map((match) => ({ fieldId: Number(match[1]), ...provenanceAt(match.index) })),
  ];
  const dedupedOperations = [...new Map(operations.map((operation) => [`${operation.symbol}|${operation.verb}|${operation.resources.join(",")}|${operation.target}|${operation.values.join(",")}`, operation])).values()];
  const dedupedConditions = [...new Map(conditions.map((condition) => [condition.expression, condition])).values()];
  const uniqueSymbols = unique(symbols);
  const informativeDepths = [
    ...events.map((event) => event.depth),
    ...dedupedConditions.filter((condition) => condition.resources.length || condition.states.length).map((condition) => condition.depth),
    ...dedupedOperations.filter((operation) => operation.resources.some((resource) => resource !== "전투 상태")).map((operation) => operation.depth),
    ...affectedFieldOccurrences.map((field) => field.depth),
  ];
  const primaryDepth = informativeDepths.length ? Math.min(...informativeDepths) : Math.min(...dedupedOperations.map((operation) => operation.depth), 0);
  const effectiveEvents = events.filter((event) => event.depth <= primaryDepth);
  const effectiveConditions = dedupedConditions.filter((condition) => condition.depth <= primaryDepth);
  const effectiveOperations = dedupedOperations.filter((operation) => operation.depth <= primaryDepth);
  const affectedFieldIds = unique(affectedFieldOccurrences.filter((field) => field.depth <= primaryDepth).map((field) => field.fieldId));
  return {
    mode,
    primaryDepth,
    events: effectiveEvents,
    conditions: effectiveConditions.slice(0, 80),
    operations: effectiveOperations.slice(0, 120),
    symbols: uniqueSymbols.slice(0, 160),
    affectedFieldIds,
    coverage: {
      eventCount: effectiveEvents.length,
      conditionCount: effectiveConditions.length,
      operationCount: effectiveOperations.length,
      symbolCount: uniqueSymbols.length,
    },
  };
}
