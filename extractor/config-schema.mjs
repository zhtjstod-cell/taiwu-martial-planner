// Read the current DLL's constructor signature instead of relying on offsets.
export function constructorFields(source, className) {
  const signature = source.match(new RegExp(`public\\s+${className}\\(([^\\n]+)\\)`))?.[1];
  if (!signature) throw new Error(`${className}: 설정 생성자 구조를 찾지 못했습니다.`);
  return signature.split(/,\s*(?![^<>]*>)/).map((parameter) => parameter.trim().match(/([A-Za-z_]\w*)\s*(?:=.*)?$/)?.[1]);
}

export function bindConfigArguments(fields, args, className) {
  if (fields.some((field) => !field) || fields.length !== args.length) {
    throw new Error(`${className}: 설정 필드 수가 일치하지 않습니다 (${fields.length}/${args.length}). 추출기를 갱신해야 합니다.`);
  }
  return Object.fromEntries(fields.map((field, index) => [field, args[index].replace(new RegExp(`^${field}\\s*:\\s*`), "")]));
}
