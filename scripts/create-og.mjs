import sharp from "sharp";

const source = process.argv[2];
const destination = process.argv[3] ?? "public/og.png";

if (!source) {
  throw new Error("Usage: node scripts/create-og.mjs <generated-image> [destination]");
}

const formation = await sharp(source)
  .extract({ left: 0, top: 0, width: 909, height: 909 })
  .resize(630, 630)
  .png()
  .toBuffer();

const typography = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111612"/>
      <stop offset="0.55" stop-color="#090b0a"/>
      <stop offset="1" stop-color="#050606"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8b682b"/>
      <stop offset="0.5" stop-color="#dfc17b"/>
      <stop offset="1" stop-color="#76531e"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.8"/></filter>
  </defs>
  <rect x="610" width="590" height="630" fill="url(#panel)"/>
  <rect x="628" y="18" width="554" height="594" rx="3" fill="none" stroke="#8e6d31" stroke-width="2"/>
  <path d="M666 224h478M666 410h478" stroke="url(#gold)" stroke-width="2" opacity="0.85"/>
  <circle cx="905" cy="316" r="6" fill="#d8b768"/>
  <circle cx="905" cy="316" r="17" fill="none" stroke="#8e6d31" stroke-width="2" transform="rotate(45 905 316)"/>
  <text x="905" y="302" text-anchor="middle" fill="#e5cc8b" font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="62" font-weight="700" letter-spacing="-2" filter="url(#shadow)">태오회권 무공진</text>
  <text x="905" y="370" text-anchor="middle" fill="#c8aa66" font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="25" font-weight="500" letter-spacing="0">946 무공 · 정·역련 시너지 플래너</text>
  <g transform="translate(806 454)" fill="none" stroke="#6f9c83" stroke-width="2" opacity="0.75">
    <circle cx="0" cy="0" r="31"/><circle cx="99" cy="0" r="31"/><circle cx="198" cy="0" r="31"/>
    <path d="M31 0h37M130 0h37" stroke="#c29b4d"/><path d="M0-31V-54M99-31V-54M198-31V-54" stroke="#9a3d32"/>
  </g>
</svg>`);

await sharp({
  create: { width: 1200, height: 630, channels: 4, background: "#060807" },
})
  .composite([
    { input: formation, left: 0, top: 0 },
    { input: typography, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(destination);

console.log(destination);
