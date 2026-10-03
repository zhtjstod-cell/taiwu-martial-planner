const declaration = (item) => item.source.match(/\bclass\s+(\w+)(?:<[^>{}]+>)?\s*(?::\s*([^{\n]+))?/);

export function assembleEffectCode(root, index) {
  const chunks = [];
  const visited = new Set();
  const find = (name, from) => {
    const candidates = index.get(name) || [];
    const folder = from.path.replace(/[\\/][^\\/]+$/, "");
    return candidates.find((candidate) => candidate.path.startsWith(folder + "/") || candidate.path.startsWith(folder + "\\"))
      || candidates.find((candidate) => /Common/.test(candidate.path)) || candidates[0];
  };
  const isImplementation = (item, seen = new Set()) => {
    if (!item || seen.has(item.path)) return false;
    seen.add(item.path);
    const types = declaration(item)?.[2] || "";
    return /\bISpecialEffectImplement\b/.test(types)
      || isImplementation(find(types.split(",")[0].trim().split(".").at(-1), item), seen);
  };
  const append = (item, depth, composed = false) => {
    if (!item || depth >= 16 || visited.has(item.path)) return;
    visited.add(item.path);
    const match = declaration(item);
    const name = match?.[1] || item.name;
    chunks.push(`// inheritance:${depth}:${name}\n${item.source}`);
    for (const reference of item.source.matchAll(/\bnew\s+(\w+)\s*(?:\(|\{)/g)) {
      const component = find(reference[1], item);
      if (isImplementation(component)) append(component, depth, true);
    }
    const parent = match?.[2]?.split(",")[0].trim().replace(/<.*$/, "").split(".").at(-1);
    if (parent && !["Object", "SpecialEffectBase", "CombatSkillSpecialEffectBase"].includes(parent)) {
      append(find(parent, item), composed ? depth : depth + 1, composed);
    }
  };
  append(root, 0);
  return chunks.join("\n\n");
}
