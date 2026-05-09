/**
 * Curated built-in sprite + backdrop library.
 *
 * Each entry is a small inline SVG string — converted to a
 * `data:image/svg+xml;base64,...` URL at import time and stored in the
 * project's assets array, so the resulting project file is fully
 * self-contained (no CDN fetch at run time, no offline-mode failure).
 *
 * Convention:
 *   - Sprites use `viewBox="0 0 100 100"` and stay centered around (50,50).
 *   - Backdrops use `viewBox="0 0 480 360"` matching STAGE_WIDTH/HEIGHT.
 *   - `tags` drives the LibraryDialog chip filter. Reuse existing tag
 *     values when adding new entries so the chip strip doesn't blow up.
 */

export interface LibraryEntry {
  id: string;
  name: string;
  /** Inline SVG (string). Must include the xmlns attribute for it to
   *  be a valid standalone document the browser can decode as an image. */
  svg: string;
  /** Categorization tags surfaced as filter chips in the LibraryDialog. */
  tags: string[];
}

const NS = ' xmlns="http://www.w3.org/2000/svg"';
const sprite = (body: string) => `<svg${NS} viewBox="0 0 100 100">${body}</svg>`;
const backdrop = (body: string) => `<svg${NS} viewBox="0 0 480 360">${body}</svg>`;

// ── sprites ─────────────────────────────────────────────────────────

export const SPRITE_LIBRARY: LibraryEntry[] = [
  // Animals
  {
    id: "lib_cat",
    name: "Cat",
    tags: ["animal", "pet"],
    svg: sprite(`
      <ellipse cx="50" cy="65" rx="32" ry="24" fill="#ff9933"/>
      <polygon points="22,38 28,18 38,32" fill="#ff9933"/>
      <polygon points="78,38 72,18 62,32" fill="#ff9933"/>
      <circle cx="40" cy="60" r="3" fill="#000"/>
      <circle cx="60" cy="60" r="3" fill="#000"/>
      <path d="M44 70 Q50 76 56 70" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>
      <line x1="30" y1="68" x2="20" y2="65" stroke="#000" stroke-width="1"/>
      <line x1="30" y1="72" x2="18" y2="74" stroke="#000" stroke-width="1"/>
      <line x1="70" y1="68" x2="80" y2="65" stroke="#000" stroke-width="1"/>
      <line x1="70" y1="72" x2="82" y2="74" stroke="#000" stroke-width="1"/>`),
  },
  {
    id: "lib_dog",
    name: "Dog",
    tags: ["animal", "pet"],
    svg: sprite(`
      <ellipse cx="50" cy="62" rx="30" ry="22" fill="#a86a3e"/>
      <ellipse cx="30" cy="42" rx="10" ry="14" fill="#7a4a25"/>
      <ellipse cx="70" cy="42" rx="10" ry="14" fill="#7a4a25"/>
      <circle cx="42" cy="58" r="3" fill="#000"/>
      <circle cx="58" cy="58" r="3" fill="#000"/>
      <ellipse cx="50" cy="68" rx="6" ry="4" fill="#000"/>
      <path d="M44 76 Q50 80 56 76" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  },
  {
    id: "lib_bear",
    name: "Bear",
    tags: ["animal"],
    svg: sprite(`
      <circle cx="50" cy="55" r="28" fill="#8a5a30"/>
      <circle cx="30" cy="32" r="9" fill="#8a5a30"/>
      <circle cx="70" cy="32" r="9" fill="#8a5a30"/>
      <circle cx="30" cy="32" r="4" fill="#3a2010"/>
      <circle cx="70" cy="32" r="4" fill="#3a2010"/>
      <ellipse cx="50" cy="60" rx="14" ry="11" fill="#dcb088"/>
      <circle cx="42" cy="50" r="2.5" fill="#000"/>
      <circle cx="58" cy="50" r="2.5" fill="#000"/>
      <ellipse cx="50" cy="58" rx="3" ry="2" fill="#000"/>
      <path d="M45 65 Q50 70 55 65" stroke="#000" stroke-width="2" fill="none"/>`),
  },
  {
    id: "lib_rabbit",
    name: "Rabbit",
    tags: ["animal"],
    svg: sprite(`
      <ellipse cx="50" cy="65" rx="22" ry="20" fill="#f0f0f0"/>
      <circle cx="50" cy="42" r="14" fill="#f0f0f0"/>
      <ellipse cx="40" cy="20" rx="5" ry="14" fill="#f0f0f0"/>
      <ellipse cx="60" cy="20" rx="5" ry="14" fill="#f0f0f0"/>
      <ellipse cx="40" cy="22" rx="2" ry="9" fill="#f5b8c0"/>
      <ellipse cx="60" cy="22" rx="2" ry="9" fill="#f5b8c0"/>
      <circle cx="44" cy="42" r="2" fill="#000"/>
      <circle cx="56" cy="42" r="2" fill="#000"/>
      <ellipse cx="50" cy="48" rx="2" ry="1.5" fill="#f5a0a8"/>`),
  },
  {
    id: "lib_fish",
    name: "Fish",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="48" cy="50" rx="30" ry="18" fill="#3aa8e0"/>
      <polygon points="78,50 92,32 92,68" fill="#3aa8e0"/>
      <circle cx="32" cy="48" r="3" fill="#fff"/>
      <circle cx="32" cy="48" r="1.5" fill="#000"/>
      <path d="M28 52 Q24 54 22 56" stroke="#1a6890" stroke-width="1" fill="none"/>
      <ellipse cx="55" cy="55" rx="10" ry="3" fill="#1a78a8"/>`),
  },
  {
    id: "lib_bird",
    name: "Bird",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="55" cy="55" rx="20" ry="16" fill="#3a8af0"/>
      <circle cx="35" cy="45" r="12" fill="#3a8af0"/>
      <polygon points="22,45 14,42 14,48" fill="#f0a020"/>
      <circle cx="32" cy="42" r="2" fill="#000"/>
      <ellipse cx="60" cy="58" rx="8" ry="6" fill="#1a5acc"/>
      <line x1="50" y1="70" x2="48" y2="80" stroke="#f0a020" stroke-width="2"/>
      <line x1="58" y1="70" x2="60" y2="80" stroke="#f0a020" stroke-width="2"/>`),
  },
  {
    id: "lib_butterfly",
    name: "Butterfly",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="50" cy="50" rx="2" ry="20" fill="#3a3a3a"/>
      <ellipse cx="32" cy="38" rx="18" ry="14" fill="#e84a78" transform="rotate(-15 32 38)"/>
      <ellipse cx="68" cy="38" rx="18" ry="14" fill="#e84a78" transform="rotate(15 68 38)"/>
      <ellipse cx="34" cy="65" rx="14" ry="11" fill="#f070a0" transform="rotate(15 34 65)"/>
      <ellipse cx="66" cy="65" rx="14" ry="11" fill="#f070a0" transform="rotate(-15 66 65)"/>
      <circle cx="32" cy="38" r="3" fill="#fff"/>
      <circle cx="68" cy="38" r="3" fill="#fff"/>`),
  },
  {
    id: "lib_frog",
    name: "Frog",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="50" cy="62" rx="32" ry="22" fill="#4ab048"/>
      <circle cx="35" cy="38" r="10" fill="#4ab048"/>
      <circle cx="65" cy="38" r="10" fill="#4ab048"/>
      <circle cx="35" cy="38" r="6" fill="#fff"/>
      <circle cx="65" cy="38" r="6" fill="#fff"/>
      <circle cx="35" cy="38" r="3" fill="#000"/>
      <circle cx="65" cy="38" r="3" fill="#000"/>
      <path d="M38 65 Q50 76 62 65" stroke="#1a6028" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  },
  {
    id: "lib_mouse",
    name: "Mouse",
    tags: ["animal", "pet"],
    svg: sprite(`
      <ellipse cx="50" cy="60" rx="22" ry="18" fill="#a8a8b0"/>
      <circle cx="32" cy="46" r="10" fill="#a8a8b0"/>
      <circle cx="22" cy="38" r="6" fill="#a8a8b0"/>
      <circle cx="22" cy="38" r="3" fill="#f5b8c0"/>
      <circle cx="32" cy="44" r="2" fill="#000"/>
      <circle cx="26" cy="48" r="1.5" fill="#000"/>
      <path d="M70 60 Q82 60 80 70" stroke="#a8a8b0" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  },
  {
    id: "lib_owl",
    name: "Owl",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="50" cy="55" rx="26" ry="30" fill="#7a5a30"/>
      <circle cx="38" cy="40" r="10" fill="#fff"/>
      <circle cx="62" cy="40" r="10" fill="#fff"/>
      <circle cx="38" cy="40" r="5" fill="#3a2010"/>
      <circle cx="62" cy="40" r="5" fill="#3a2010"/>
      <circle cx="38" cy="40" r="2" fill="#fff"/>
      <circle cx="62" cy="40" r="2" fill="#fff"/>
      <polygon points="50,46 46,52 54,52" fill="#f0a020"/>
      <ellipse cx="50" cy="68" rx="10" ry="6" fill="#dcb088"/>`),
  },
  {
    id: "lib_panda",
    name: "Panda",
    tags: ["animal"],
    svg: sprite(`
      <circle cx="50" cy="55" r="28" fill="#fff"/>
      <circle cx="28" cy="32" r="9" fill="#000"/>
      <circle cx="72" cy="32" r="9" fill="#000"/>
      <ellipse cx="42" cy="50" rx="6" ry="8" fill="#000"/>
      <ellipse cx="58" cy="50" rx="6" ry="8" fill="#000"/>
      <circle cx="42" cy="50" r="2" fill="#fff"/>
      <circle cx="58" cy="50" r="2" fill="#fff"/>
      <ellipse cx="50" cy="60" rx="3" ry="2" fill="#000"/>
      <path d="M45 66 Q50 70 55 66" stroke="#000" stroke-width="1.5" fill="none"/>`),
  },
  {
    id: "lib_chicken",
    name: "Chicken",
    tags: ["animal"],
    svg: sprite(`
      <ellipse cx="50" cy="62" rx="22" ry="20" fill="#fff8e0"/>
      <circle cx="50" cy="38" r="14" fill="#fff8e0"/>
      <path d="M42 26 Q44 18 48 22 Q50 16 54 22 Q58 18 60 26" fill="#e84a4a"/>
      <polygon points="62,40 70,38 62,44" fill="#f0a020"/>
      <circle cx="55" cy="36" r="2" fill="#000"/>
      <ellipse cx="48" cy="80" rx="3" ry="2" fill="#f0a020"/>
      <ellipse cx="56" cy="80" rx="3" ry="2" fill="#f0a020"/>`),
  },
  {
    id: "lib_cow",
    name: "Cow",
    tags: ["animal"],
    svg: sprite(`
      <ellipse cx="50" cy="60" rx="30" ry="22" fill="#fff"/>
      <ellipse cx="30" cy="50" rx="6" ry="8" fill="#000"/>
      <ellipse cx="68" cy="68" rx="8" ry="6" fill="#000"/>
      <ellipse cx="50" cy="38" rx="14" ry="12" fill="#f5d8b8"/>
      <circle cx="44" cy="36" r="2" fill="#000"/>
      <circle cx="56" cy="36" r="2" fill="#000"/>
      <ellipse cx="44" cy="44" rx="2" ry="1" fill="#000"/>
      <ellipse cx="56" cy="44" rx="2" ry="1" fill="#000"/>
      <polygon points="38,28 30,22 36,32" fill="#f0c898"/>
      <polygon points="62,28 70,22 64,32" fill="#f0c898"/>`),
  },
  {
    id: "lib_pig",
    name: "Pig",
    tags: ["animal"],
    svg: sprite(`
      <ellipse cx="50" cy="58" rx="30" ry="24" fill="#f5b0c0"/>
      <ellipse cx="50" cy="60" rx="10" ry="8" fill="#e890a0"/>
      <ellipse cx="46" cy="60" rx="1.5" ry="2" fill="#5a3040"/>
      <ellipse cx="54" cy="60" rx="1.5" ry="2" fill="#5a3040"/>
      <circle cx="40" cy="48" r="2" fill="#000"/>
      <circle cx="60" cy="48" r="2" fill="#000"/>
      <polygon points="36,32 30,22 42,30" fill="#f5b0c0"/>
      <polygon points="64,32 70,22 58,30" fill="#f5b0c0"/>`),
  },
  {
    id: "lib_tiger",
    name: "Tiger",
    tags: ["animal"],
    svg: sprite(`
      <circle cx="50" cy="55" r="28" fill="#f0a040"/>
      <ellipse cx="50" cy="60" rx="14" ry="10" fill="#fff8e0"/>
      <line x1="20" y1="50" x2="32" y2="48" stroke="#3a2010" stroke-width="2"/>
      <line x1="22" y1="60" x2="32" y2="60" stroke="#3a2010" stroke-width="2"/>
      <line x1="68" y1="48" x2="80" y2="50" stroke="#3a2010" stroke-width="2"/>
      <line x1="68" y1="60" x2="78" y2="60" stroke="#3a2010" stroke-width="2"/>
      <circle cx="42" cy="50" r="2.5" fill="#000"/>
      <circle cx="58" cy="50" r="2.5" fill="#000"/>
      <ellipse cx="50" cy="60" rx="2.5" ry="1.8" fill="#000"/>`),
  },
  {
    id: "lib_lion",
    name: "Lion",
    tags: ["animal"],
    svg: sprite(`
      <circle cx="50" cy="55" r="34" fill="#c89048"/>
      <circle cx="50" cy="55" r="24" fill="#f0c878"/>
      <circle cx="42" cy="52" r="2.5" fill="#000"/>
      <circle cx="58" cy="52" r="2.5" fill="#000"/>
      <ellipse cx="50" cy="60" rx="3" ry="2" fill="#000"/>
      <path d="M45 66 Q50 70 55 66" stroke="#000" stroke-width="1.5" fill="none"/>`),
  },
  {
    id: "lib_fox",
    name: "Fox",
    tags: ["animal"],
    svg: sprite(`
      <polygon points="20,30 30,40 35,55" fill="#e87030"/>
      <polygon points="80,30 70,40 65,55" fill="#e87030"/>
      <ellipse cx="50" cy="60" rx="26" ry="22" fill="#e87030"/>
      <ellipse cx="50" cy="62" rx="14" ry="10" fill="#fff"/>
      <circle cx="42" cy="54" r="2.5" fill="#000"/>
      <circle cx="58" cy="54" r="2.5" fill="#000"/>
      <ellipse cx="50" cy="64" rx="2" ry="1.5" fill="#000"/>`),
  },
  {
    id: "lib_monkey",
    name: "Monkey",
    tags: ["animal"],
    svg: sprite(`
      <circle cx="50" cy="55" r="28" fill="#7a4a28"/>
      <circle cx="30" cy="50" r="8" fill="#7a4a28"/>
      <circle cx="70" cy="50" r="8" fill="#7a4a28"/>
      <ellipse cx="50" cy="60" rx="18" ry="14" fill="#dcb088"/>
      <circle cx="44" cy="52" r="2.5" fill="#000"/>
      <circle cx="56" cy="52" r="2.5" fill="#000"/>
      <ellipse cx="50" cy="62" rx="3" ry="2" fill="#000"/>
      <path d="M44 68 Q50 73 56 68" stroke="#000" stroke-width="1.5" fill="none"/>`),
  },
  {
    id: "lib_elephant",
    name: "Elephant",
    tags: ["animal"],
    svg: sprite(`
      <ellipse cx="50" cy="58" rx="32" ry="24" fill="#a8a8b8"/>
      <path d="M30 70 Q20 80 28 90 Q34 92 36 84" fill="#a8a8b8"/>
      <ellipse cx="20" cy="48" rx="10" ry="14" fill="#888898"/>
      <ellipse cx="80" cy="48" rx="10" ry="14" fill="#888898"/>
      <circle cx="40" cy="50" r="2" fill="#000"/>
      <circle cx="60" cy="50" r="2" fill="#000"/>
      <line x1="42" y1="76" x2="40" y2="86" stroke="#fff" stroke-width="2"/>
      <line x1="58" y1="76" x2="60" y2="86" stroke="#fff" stroke-width="2"/>`),
  },
  {
    id: "lib_snail",
    name: "Snail",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="55" cy="65" rx="32" ry="10" fill="#dcb088"/>
      <circle cx="55" cy="55" r="22" fill="#c87a48"/>
      <circle cx="55" cy="55" r="14" fill="#dcb088"/>
      <circle cx="55" cy="55" r="6" fill="#a85020"/>
      <line x1="80" y1="62" x2="86" y2="50" stroke="#dcb088" stroke-width="2"/>
      <circle cx="86" cy="50" r="3" fill="#dcb088"/>
      <circle cx="86" cy="50" r="1.5" fill="#000"/>`),
  },
  {
    id: "lib_turtle",
    name: "Turtle",
    tags: ["animal"],
    svg: sprite(`
      <ellipse cx="50" cy="58" rx="30" ry="20" fill="#4a8030"/>
      <circle cx="50" cy="55" r="20" fill="#7ab048"/>
      <circle cx="50" cy="55" r="20" fill="none" stroke="#3a6020" stroke-width="2"/>
      <line x1="50" y1="35" x2="50" y2="75" stroke="#3a6020" stroke-width="1.5"/>
      <line x1="30" y1="55" x2="70" y2="55" stroke="#3a6020" stroke-width="1.5"/>
      <ellipse cx="80" cy="48" rx="8" ry="6" fill="#7ab048"/>
      <circle cx="84" cy="46" r="1.5" fill="#000"/>
      <ellipse cx="22" cy="72" rx="6" ry="4" fill="#7ab048"/>
      <ellipse cx="78" cy="72" rx="6" ry="4" fill="#7ab048"/>`),
  },
  {
    id: "lib_bee",
    name: "Bee",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="50" cy="55" rx="22" ry="18" fill="#f0c020"/>
      <rect x="36" y="42" width="6" height="26" fill="#3a2010"/>
      <rect x="48" y="42" width="6" height="26" fill="#3a2010"/>
      <rect x="60" y="42" width="6" height="26" fill="#3a2010"/>
      <ellipse cx="38" cy="38" rx="14" ry="10" fill="#fff" opacity="0.7"/>
      <ellipse cx="62" cy="38" rx="14" ry="10" fill="#fff" opacity="0.7"/>
      <circle cx="42" cy="52" r="2" fill="#000"/>
      <circle cx="58" cy="52" r="2" fill="#000"/>`),
  },
  {
    id: "lib_octopus",
    name: "Octopus",
    tags: ["animal", "nature"],
    svg: sprite(`
      <ellipse cx="50" cy="42" rx="26" ry="22" fill="#a85ac8"/>
      <path d="M28 56 Q22 80 16 88" stroke="#a85ac8" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M38 60 Q34 84 30 90" stroke="#a85ac8" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M50 62 Q50 86 50 92" stroke="#a85ac8" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M62 60 Q66 84 70 90" stroke="#a85ac8" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M72 56 Q78 80 84 88" stroke="#a85ac8" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="40" cy="38" r="3" fill="#fff"/>
      <circle cx="60" cy="38" r="3" fill="#fff"/>
      <circle cx="40" cy="38" r="1.5" fill="#000"/>
      <circle cx="60" cy="38" r="1.5" fill="#000"/>`),
  },
  {
    id: "lib_dolphin",
    name: "Dolphin",
    tags: ["animal", "nature"],
    svg: sprite(`
      <path d="M10 60 Q30 30 60 40 Q80 44 90 56 Q70 64 50 60 Q30 58 10 60 Z" fill="#7898c0"/>
      <polygon points="60,40 65,28 72,42" fill="#7898c0"/>
      <polygon points="86,56 96,52 90,64" fill="#7898c0"/>
      <circle cx="30" cy="52" r="1.8" fill="#000"/>
      <path d="M22 55 Q26 58 30 56" stroke="#3a5a80" stroke-width="1" fill="none"/>`),
  },
  {
    id: "lib_dragon",
    name: "Dragon",
    tags: ["animal", "fantasy"],
    svg: sprite(`
      <ellipse cx="50" cy="60" rx="28" ry="20" fill="#3a8a40"/>
      <circle cx="68" cy="40" r="14" fill="#3a8a40"/>
      <polygon points="56,30 60,18 66,28" fill="#3a8a40"/>
      <polygon points="72,28 76,16 82,28" fill="#3a8a40"/>
      <ellipse cx="40" cy="50" rx="14" ry="10" fill="#7ac848" opacity="0.7"/>
      <circle cx="72" cy="42" r="2" fill="#000"/>
      <polygon points="82,46 90,42 86,50" fill="#f0a020"/>
      <path d="M22 70 Q14 80 24 86" stroke="#3a8a40" stroke-width="6" fill="none" stroke-linecap="round"/>`),
  },

  // People & Fantasy
  {
    id: "lib_boy",
    name: "Boy",
    tags: ["person"],
    svg: sprite(`
      <circle cx="50" cy="36" r="14" fill="#f5d0a8"/>
      <path d="M36 32 Q50 14 64 32 L62 24 Q50 18 38 24 Z" fill="#5a3a20"/>
      <circle cx="44" cy="36" r="1.8" fill="#000"/>
      <circle cx="56" cy="36" r="1.8" fill="#000"/>
      <path d="M46 42 Q50 45 54 42" stroke="#000" stroke-width="1.5" fill="none"/>
      <rect x="36" y="50" width="28" height="34" fill="#3a8af0"/>
      <rect x="36" y="50" width="28" height="6" fill="#1a6acc"/>
      <rect x="40" y="84" width="8" height="6" fill="#3a3a48"/>
      <rect x="52" y="84" width="8" height="6" fill="#3a3a48"/>`),
  },
  {
    id: "lib_girl",
    name: "Girl",
    tags: ["person"],
    svg: sprite(`
      <circle cx="50" cy="36" r="14" fill="#f5d0a8"/>
      <path d="M34 36 Q34 18 50 18 Q66 18 66 36 L62 36 Q60 26 50 26 Q40 26 38 36 Z" fill="#a04020"/>
      <ellipse cx="34" cy="46" rx="6" ry="14" fill="#a04020"/>
      <ellipse cx="66" cy="46" rx="6" ry="14" fill="#a04020"/>
      <circle cx="44" cy="36" r="1.8" fill="#000"/>
      <circle cx="56" cy="36" r="1.8" fill="#000"/>
      <path d="M46 42 Q50 45 54 42" stroke="#000" stroke-width="1.5" fill="none"/>
      <polygon points="36,52 50,52 64,52 60,84 40,84" fill="#e84a78"/>
      <rect x="40" y="84" width="8" height="6" fill="#3a3a48"/>
      <rect x="52" y="84" width="8" height="6" fill="#3a3a48"/>`),
  },
  {
    id: "lib_wizard",
    name: "Wizard",
    tags: ["person", "fantasy"],
    svg: sprite(`
      <polygon points="32,42 50,12 68,42" fill="#3a3aa0"/>
      <polygon points="32,42 68,42 64,46 36,46" fill="#1a1a60"/>
      <polygon points="50,18 53,26 50,28 47,26" fill="#f0c020"/>
      <circle cx="50" cy="50" r="12" fill="#f5d0a8"/>
      <path d="M44 56 Q50 60 56 56" stroke="#000" stroke-width="1.5" fill="none"/>
      <circle cx="46" cy="50" r="1.5" fill="#000"/>
      <circle cx="54" cy="50" r="1.5" fill="#000"/>
      <path d="M40 62 L36 92 L64 92 L60 62 Z" fill="#3a3aa0"/>`),
  },
  {
    id: "lib_knight",
    name: "Knight",
    tags: ["person", "fantasy"],
    svg: sprite(`
      <rect x="38" y="22" width="24" height="28" fill="#a8a8b0"/>
      <rect x="44" y="32" width="12" height="6" fill="#000"/>
      <polygon points="38,22 50,14 62,22" fill="#a8a8b0"/>
      <polygon points="48,14 50,8 52,14" fill="#e84a4a"/>
      <rect x="36" y="50" width="28" height="32" fill="#888898"/>
      <rect x="40" y="84" width="8" height="6" fill="#3a3a48"/>
      <rect x="52" y="84" width="8" height="6" fill="#3a3a48"/>
      <line x1="76" y1="38" x2="84" y2="80" stroke="#a8a8b0" stroke-width="3"/>`),
  },
  {
    id: "lib_ninja",
    name: "Ninja",
    tags: ["person", "fantasy"],
    svg: sprite(`
      <circle cx="50" cy="36" r="14" fill="#3a3a48"/>
      <rect x="36" y="32" width="28" height="6" fill="#3a3a48"/>
      <ellipse cx="44" cy="34" rx="3" ry="2" fill="#fff"/>
      <ellipse cx="56" cy="34" rx="3" ry="2" fill="#fff"/>
      <rect x="36" y="50" width="28" height="34" fill="#3a3a48"/>
      <rect x="40" y="84" width="8" height="6" fill="#1a1a28"/>
      <rect x="52" y="84" width="8" height="6" fill="#1a1a28"/>
      <line x1="76" y1="40" x2="86" y2="32" stroke="#888" stroke-width="2"/>`),
  },
  {
    id: "lib_alien",
    name: "Alien",
    tags: ["person", "fantasy"],
    svg: sprite(`
      <ellipse cx="50" cy="40" rx="20" ry="22" fill="#7ad868"/>
      <ellipse cx="42" cy="42" rx="6" ry="9" fill="#000"/>
      <ellipse cx="58" cy="42" rx="6" ry="9" fill="#000"/>
      <ellipse cx="42" cy="40" rx="2" ry="3" fill="#fff"/>
      <ellipse cx="58" cy="40" rx="2" ry="3" fill="#fff"/>
      <line x1="40" y1="22" x2="36" y2="14" stroke="#5aa848" stroke-width="2"/>
      <line x1="60" y1="22" x2="64" y2="14" stroke="#5aa848" stroke-width="2"/>
      <circle cx="36" cy="14" r="2" fill="#5aa848"/>
      <circle cx="64" cy="14" r="2" fill="#5aa848"/>
      <ellipse cx="50" cy="74" rx="22" ry="14" fill="#5aa848"/>`),
  },
  {
    id: "lib_robot",
    name: "Robot",
    tags: ["object", "fantasy"],
    svg: sprite(`
      <rect x="32" y="32" width="36" height="40" fill="#a8a8b0" stroke="#404048" stroke-width="2"/>
      <rect x="38" y="38" width="24" height="14" fill="#3a3a48"/>
      <circle cx="44" cy="45" r="3" fill="#33ff66"/>
      <circle cx="56" cy="45" r="3" fill="#33ff66"/>
      <rect x="44" y="58" width="12" height="3" fill="#3a3a48"/>
      <rect x="38" y="20" width="24" height="14" fill="#a8a8b0" stroke="#404048" stroke-width="2"/>
      <line x1="50" y1="20" x2="50" y2="14" stroke="#404048" stroke-width="2"/>
      <circle cx="50" cy="12" r="3" fill="#e84a4a"/>
      <rect x="20" y="44" width="12" height="6" fill="#a8a8b0" stroke="#404048" stroke-width="2"/>
      <rect x="68" y="44" width="12" height="6" fill="#a8a8b0" stroke="#404048" stroke-width="2"/>
      <rect x="36" y="74" width="10" height="14" fill="#a8a8b0" stroke="#404048" stroke-width="2"/>
      <rect x="54" y="74" width="10" height="14" fill="#a8a8b0" stroke="#404048" stroke-width="2"/>`),
  },
  {
    id: "lib_ghost",
    name: "Ghost",
    tags: ["fantasy"],
    svg: sprite(`
      <path d="M22 40 Q22 14 50 14 Q78 14 78 40 L78 80 Q70 70 64 80 Q56 70 50 80 Q44 70 36 80 Q30 70 22 80 Z" fill="#f4f6fa" opacity="0.95"/>
      <ellipse cx="42" cy="38" rx="3" ry="5" fill="#000"/>
      <ellipse cx="58" cy="38" rx="3" ry="5" fill="#000"/>
      <ellipse cx="50" cy="50" rx="4" ry="6" fill="#000"/>`),
  },
  {
    id: "lib_unicorn",
    name: "Unicorn",
    tags: ["animal", "fantasy"],
    svg: sprite(`
      <ellipse cx="50" cy="62" rx="30" ry="20" fill="#fff"/>
      <circle cx="32" cy="48" r="12" fill="#fff"/>
      <polygon points="22,38 12,18 30,32" fill="#fff"/>
      <polygon points="32,38 32,16 38,30" fill="#f0c878"/>
      <path d="M40 38 Q44 28 48 38" stroke="#e84a78" stroke-width="3" fill="none"/>
      <path d="M48 38 Q52 28 56 38" stroke="#3a8af0" stroke-width="3" fill="none"/>
      <circle cx="32" cy="48" r="2" fill="#000"/>`),
  },
  {
    id: "lib_pirate",
    name: "Pirate",
    tags: ["person", "fantasy"],
    svg: sprite(`
      <circle cx="50" cy="38" r="14" fill="#f5d0a8"/>
      <path d="M32 28 Q32 18 50 18 Q68 18 68 28 L68 32 L32 32 Z" fill="#3a3a48"/>
      <rect x="34" y="32" width="32" height="3" fill="#000"/>
      <ellipse cx="42" cy="38" rx="5" ry="4" fill="#000"/>
      <line x1="36" y1="36" x2="48" y2="36" stroke="#000" stroke-width="1.5"/>
      <circle cx="56" cy="38" r="1.5" fill="#000"/>
      <path d="M44 46 Q50 50 56 46" stroke="#000" stroke-width="1.5" fill="none"/>
      <rect x="36" y="52" width="28" height="34" fill="#a04040"/>
      <rect x="36" y="52" width="28" height="6" fill="#fff"/>`),
  },

  // Foods
  {
    id: "lib_apple",
    name: "Apple",
    tags: ["food", "nature"],
    svg: sprite(`
      <path d="M50 30 Q56 16 70 22" stroke="#5a3010" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M30 50 Q30 30 50 32 Q70 30 70 50 Q70 80 50 86 Q30 80 30 50 Z" fill="#cc2222"/>
      <ellipse cx="42" cy="44" rx="6" ry="4" fill="#fff" opacity="0.5"/>
      <ellipse cx="58" cy="40" rx="3" ry="6" fill="#3a8a30"/>`),
  },
  {
    id: "lib_banana",
    name: "Banana",
    tags: ["food"],
    svg: sprite(`
      <path d="M22 70 Q40 24 80 30 Q70 32 64 38 Q50 50 38 64 Q30 72 22 70 Z" fill="#f0c020"/>
      <path d="M22 70 Q40 24 80 30" stroke="#a08018" stroke-width="2" fill="none"/>`),
  },
  {
    id: "lib_pizza",
    name: "Pizza",
    tags: ["food"],
    svg: sprite(`
      <polygon points="50,12 88,82 12,82" fill="#f0c878"/>
      <polygon points="50,22 78,76 22,76" fill="#e84a4a"/>
      <circle cx="42" cy="58" r="5" fill="#fff"/>
      <circle cx="58" cy="50" r="5" fill="#fff"/>
      <circle cx="50" cy="70" r="5" fill="#fff"/>
      <circle cx="38" cy="70" r="3" fill="#5a3010"/>
      <circle cx="62" cy="68" r="3" fill="#5a3010"/>`),
  },
  {
    id: "lib_cake",
    name: "Cake",
    tags: ["food"],
    svg: sprite(`
      <rect x="20" y="56" width="60" height="28" fill="#f5d0a8"/>
      <rect x="20" y="50" width="60" height="8" fill="#fff"/>
      <path d="M20 50 Q35 44 50 50 Q65 44 80 50 L80 56 L20 56 Z" fill="#fff"/>
      <rect x="48" y="36" width="4" height="12" fill="#f0c020"/>
      <ellipse cx="50" cy="32" rx="3" ry="4" fill="#e84a4a"/>
      <circle cx="32" cy="68" r="3" fill="#e84a4a"/>
      <circle cx="50" cy="74" r="3" fill="#3a8af0"/>
      <circle cx="68" cy="68" r="3" fill="#7ac848"/>`),
  },
  {
    id: "lib_donut",
    name: "Donut",
    tags: ["food"],
    svg: sprite(`
      <circle cx="50" cy="50" r="32" fill="#f0a878"/>
      <circle cx="50" cy="50" r="14" fill="#fff"/>
      <path d="M22 38 Q26 20 50 22 Q74 20 78 38 Q70 50 50 48 Q30 50 22 38 Z" fill="#f070a0"/>
      <circle cx="34" cy="32" r="1.5" fill="#fff"/>
      <circle cx="50" cy="26" r="1.5" fill="#3a8af0"/>
      <circle cx="66" cy="32" r="1.5" fill="#7ac848"/>
      <circle cx="42" cy="42" r="1.5" fill="#fff"/>
      <circle cx="58" cy="42" r="1.5" fill="#f0c020"/>`),
  },
  {
    id: "lib_watermelon",
    name: "Watermelon",
    tags: ["food", "nature"],
    svg: sprite(`
      <path d="M14 56 Q50 88 86 56 L86 60 Q50 92 14 60 Z" fill="#3a8030"/>
      <path d="M14 56 Q50 88 86 56" stroke="#fff" stroke-width="3" fill="none"/>
      <path d="M18 54 Q50 84 82 54 Q50 78 18 54 Z" fill="#e84a4a"/>
      <ellipse cx="40" cy="68" rx="2" ry="3" fill="#000"/>
      <ellipse cx="55" cy="72" rx="2" ry="3" fill="#000"/>
      <ellipse cx="68" cy="64" rx="2" ry="3" fill="#000"/>`),
  },
  {
    id: "lib_sandwich",
    name: "Sandwich",
    tags: ["food"],
    svg: sprite(`
      <path d="M14 38 Q14 22 30 22 L70 22 Q86 22 86 38 L86 42 L14 42 Z" fill="#f0c878"/>
      <rect x="14" y="42" width="72" height="6" fill="#3a8a40"/>
      <rect x="14" y="48" width="72" height="6" fill="#a04040"/>
      <rect x="14" y="54" width="72" height="6" fill="#f0c020"/>
      <path d="M14 60 L86 60 L86 70 Q86 76 70 76 L30 76 Q14 76 14 70 Z" fill="#f0c878"/>`),
  },
  {
    id: "lib_cherry",
    name: "Cherry",
    tags: ["food", "nature"],
    svg: sprite(`
      <path d="M40 24 Q60 14 70 30" stroke="#3a8030" stroke-width="3" fill="none"/>
      <circle cx="36" cy="62" r="14" fill="#cc2222"/>
      <circle cx="64" cy="68" r="14" fill="#cc2222"/>
      <ellipse cx="32" cy="56" rx="3" ry="2" fill="#fff" opacity="0.5"/>
      <ellipse cx="60" cy="62" rx="3" ry="2" fill="#fff" opacity="0.5"/>`),
  },
  {
    id: "lib_strawberry",
    name: "Strawberry",
    tags: ["food", "nature"],
    svg: sprite(`
      <path d="M30 36 Q50 14 70 36" fill="#3a8030"/>
      <path d="M30 36 Q30 86 50 86 Q70 86 70 36 Q50 50 30 36 Z" fill="#e84a4a"/>
      <circle cx="42" cy="50" r="1.5" fill="#f0c020"/>
      <circle cx="58" cy="50" r="1.5" fill="#f0c020"/>
      <circle cx="50" cy="60" r="1.5" fill="#f0c020"/>
      <circle cx="38" cy="68" r="1.5" fill="#f0c020"/>
      <circle cx="62" cy="68" r="1.5" fill="#f0c020"/>
      <circle cx="50" cy="76" r="1.5" fill="#f0c020"/>`),
  },
  {
    id: "lib_icecream",
    name: "Ice Cream",
    tags: ["food"],
    svg: sprite(`
      <polygon points="34,40 66,40 50,90" fill="#f0c878"/>
      <line x1="38" y1="50" x2="62" y2="50" stroke="#a08018"/>
      <line x1="42" y1="60" x2="58" y2="60" stroke="#a08018"/>
      <line x1="46" y1="70" x2="54" y2="70" stroke="#a08018"/>
      <circle cx="42" cy="34" r="14" fill="#f0a0c8"/>
      <circle cx="58" cy="34" r="14" fill="#f5d0a8"/>
      <circle cx="50" cy="20" r="12" fill="#a06030"/>`),
  },
  {
    id: "lib_taco",
    name: "Taco",
    tags: ["food"],
    svg: sprite(`
      <path d="M14 70 Q50 30 86 70 L78 78 Q50 56 22 78 Z" fill="#f0c020"/>
      <path d="M22 76 Q50 60 78 76" stroke="#a08018" stroke-width="2" fill="none"/>
      <circle cx="36" cy="68" r="3" fill="#e84a4a"/>
      <circle cx="50" cy="64" r="3" fill="#3a8030"/>
      <circle cx="64" cy="68" r="3" fill="#a04040"/>`),
  },
  {
    id: "lib_cookie",
    name: "Cookie",
    tags: ["food"],
    svg: sprite(`
      <circle cx="50" cy="50" r="34" fill="#c08858"/>
      <circle cx="50" cy="50" r="34" fill="none" stroke="#7a4a25" stroke-width="2"/>
      <circle cx="36" cy="38" r="3" fill="#3a2010"/>
      <circle cx="60" cy="34" r="3" fill="#3a2010"/>
      <circle cx="42" cy="58" r="3" fill="#3a2010"/>
      <circle cx="64" cy="60" r="3" fill="#3a2010"/>
      <circle cx="50" cy="46" r="3" fill="#3a2010"/>
      <circle cx="34" cy="64" r="3" fill="#3a2010"/>`),
  },
  {
    id: "lib_cupcake",
    name: "Cupcake",
    tags: ["food"],
    svg: sprite(`
      <path d="M28 56 L72 56 L66 88 L34 88 Z" fill="#a06030"/>
      <line x1="36" y1="60" x2="34" y2="86" stroke="#5a3010"/>
      <line x1="50" y1="60" x2="50" y2="88" stroke="#5a3010"/>
      <line x1="64" y1="60" x2="66" y2="86" stroke="#5a3010"/>
      <path d="M22 56 Q22 38 50 38 Q78 38 78 56 Z" fill="#f070a0"/>
      <circle cx="50" cy="32" r="3" fill="#e84a4a"/>`),
  },
  {
    id: "lib_carrot",
    name: "Carrot",
    tags: ["food", "nature"],
    svg: sprite(`
      <polygon points="40,30 50,84 60,30" fill="#f08030"/>
      <line x1="42" y1="40" x2="58" y2="40" stroke="#a04020"/>
      <line x1="44" y1="52" x2="56" y2="52" stroke="#a04020"/>
      <line x1="46" y1="64" x2="54" y2="64" stroke="#a04020"/>
      <polygon points="40,30 36,16 46,22" fill="#3a8030"/>
      <polygon points="50,30 50,12 56,24" fill="#3a8030"/>
      <polygon points="60,30 64,16 54,22" fill="#3a8030"/>`),
  },
  {
    id: "lib_mushroom",
    name: "Mushroom",
    tags: ["nature", "fantasy"],
    svg: sprite(`
      <path d="M14 50 Q14 20 50 20 Q86 20 86 50 L86 56 L14 56 Z" fill="#cc3030"/>
      <circle cx="32" cy="36" r="6" fill="#fff"/>
      <circle cx="56" cy="32" r="5" fill="#fff"/>
      <circle cx="70" cy="44" r="4" fill="#fff"/>
      <rect x="36" y="56" width="28" height="32" fill="#f5e6c8"/>
      <ellipse cx="50" cy="56" rx="14" ry="3" fill="#dccca8"/>`),
  },

  // Vehicles
  {
    id: "lib_car",
    name: "Car",
    tags: ["vehicle"],
    svg: sprite(`
      <path d="M10 60 L20 40 L80 40 L90 60 L90 72 L10 72 Z" fill="#3a8af0"/>
      <path d="M22 42 L34 28 L66 28 L78 42 Z" fill="#7ac0f0"/>
      <line x1="50" y1="28" x2="50" y2="42" stroke="#1a4a90"/>
      <circle cx="26" cy="72" r="8" fill="#202020"/>
      <circle cx="74" cy="72" r="8" fill="#202020"/>
      <circle cx="26" cy="72" r="3" fill="#888"/>
      <circle cx="74" cy="72" r="3" fill="#888"/>`),
  },
  {
    id: "lib_plane",
    name: "Plane",
    tags: ["vehicle"],
    svg: sprite(`
      <path d="M10 50 L70 44 L86 38 L88 50 L86 62 L70 56 Z" fill="#a8a8b8"/>
      <polygon points="36,44 30,20 50,42" fill="#888898"/>
      <polygon points="36,56 30,80 50,58" fill="#888898"/>
      <circle cx="80" cy="50" r="2" fill="#3a8af0"/>
      <circle cx="74" cy="50" r="2" fill="#3a8af0"/>
      <circle cx="68" cy="50" r="2" fill="#3a8af0"/>`),
  },
  {
    id: "lib_rocket",
    name: "Rocket",
    tags: ["vehicle", "fantasy"],
    svg: sprite(`
      <path d="M40 80 L40 30 Q40 12 50 8 Q60 12 60 30 L60 80 Z" fill="#f4f6fa"/>
      <path d="M40 80 L40 30 Q40 12 50 8 Q60 12 60 30 L60 80" fill="none" stroke="#a8a8b8" stroke-width="2"/>
      <circle cx="50" cy="40" r="6" fill="#3a8af0"/>
      <polygon points="40,70 28,86 40,82" fill="#e84a4a"/>
      <polygon points="60,70 72,86 60,82" fill="#e84a4a"/>
      <polygon points="44,84 50,94 56,84" fill="#f0c020"/>`),
  },
  {
    id: "lib_boat",
    name: "Boat",
    tags: ["vehicle"],
    svg: sprite(`
      <path d="M14 60 L86 60 L78 76 L22 76 Z" fill="#a06030"/>
      <rect x="48" y="22" width="3" height="40" fill="#5a3010"/>
      <polygon points="51,22 78,46 51,46" fill="#fff"/>
      <polygon points="48,22 22,46 48,46" fill="#fff"/>
      <path d="M10 80 Q20 76 30 80 Q40 76 50 80 Q60 76 70 80 Q80 76 90 80" stroke="#3a8af0" stroke-width="2" fill="none"/>`),
  },
  {
    id: "lib_train",
    name: "Train",
    tags: ["vehicle"],
    svg: sprite(`
      <rect x="14" y="40" width="60" height="32" fill="#cc2222"/>
      <rect x="20" y="46" width="14" height="14" fill="#7ac0f0"/>
      <rect x="40" y="46" width="14" height="14" fill="#7ac0f0"/>
      <rect x="60" y="46" width="14" height="14" fill="#7ac0f0"/>
      <rect x="74" y="50" width="12" height="22" fill="#a04040"/>
      <rect x="74" y="34" width="6" height="20" fill="#5a3a3a"/>
      <circle cx="80" cy="32" r="4" fill="#888"/>
      <circle cx="26" cy="78" r="6" fill="#202020"/>
      <circle cx="50" cy="78" r="6" fill="#202020"/>
      <circle cx="74" cy="78" r="6" fill="#202020"/>`),
  },
  {
    id: "lib_bike",
    name: "Bike",
    tags: ["vehicle", "sport"],
    svg: sprite(`
      <circle cx="26" cy="68" r="16" fill="none" stroke="#202020" stroke-width="3"/>
      <circle cx="74" cy="68" r="16" fill="none" stroke="#202020" stroke-width="3"/>
      <line x1="26" y1="68" x2="50" y2="42" stroke="#3a8af0" stroke-width="3"/>
      <line x1="74" y1="68" x2="50" y2="42" stroke="#3a8af0" stroke-width="3"/>
      <line x1="50" y1="42" x2="50" y2="68" stroke="#3a8af0" stroke-width="3"/>
      <line x1="50" y1="68" x2="26" y2="68" stroke="#3a8af0" stroke-width="3"/>
      <line x1="50" y1="42" x2="58" y2="32" stroke="#202020" stroke-width="3"/>
      <line x1="50" y1="68" x2="42" y2="62" stroke="#202020" stroke-width="3"/>`),
  },
  {
    id: "lib_ufo",
    name: "UFO",
    tags: ["vehicle", "fantasy"],
    svg: sprite(`
      <ellipse cx="50" cy="56" rx="38" ry="10" fill="#888898"/>
      <ellipse cx="50" cy="50" rx="22" ry="12" fill="#a8b8d0"/>
      <ellipse cx="50" cy="42" rx="14" ry="8" fill="#7ac0f0" opacity="0.7"/>
      <circle cx="34" cy="58" r="2" fill="#f0c020"/>
      <circle cx="50" cy="60" r="2" fill="#f0c020"/>
      <circle cx="66" cy="58" r="2" fill="#f0c020"/>
      <path d="M32 64 L24 84 L40 80 Z" fill="#7ac0f0" opacity="0.5"/>
      <path d="M68 64 L76 84 L60 80 Z" fill="#7ac0f0" opacity="0.5"/>`),
  },
  {
    id: "lib_truck",
    name: "Truck",
    tags: ["vehicle"],
    svg: sprite(`
      <rect x="10" y="38" width="46" height="32" fill="#3a8a40"/>
      <rect x="56" y="48" width="28" height="22" fill="#5aa850"/>
      <rect x="60" y="52" width="12" height="10" fill="#7ac0f0"/>
      <circle cx="22" cy="72" r="6" fill="#202020"/>
      <circle cx="44" cy="72" r="6" fill="#202020"/>
      <circle cx="74" cy="72" r="6" fill="#202020"/>`),
  },

  // Objects, nature, symbols
  {
    id: "lib_ball",
    name: "Ball",
    tags: ["object", "sport"],
    svg: sprite(`
      <circle cx="50" cy="50" r="36" fill="#e84a4a"/>
      <ellipse cx="40" cy="38" rx="10" ry="6" fill="#fff" opacity="0.5"/>
      <circle cx="50" cy="50" r="36" fill="none" stroke="#7a1a1a" stroke-width="2"/>`),
  },
  {
    id: "lib_star",
    name: "Star",
    tags: ["symbol"],
    svg: sprite(`
      <polygon points="50,10 61,38 91,40 67,60 76,90 50,72 24,90 33,60 9,40 39,38"
               fill="#ffd633" stroke="#b08200" stroke-width="2"/>`),
  },
  {
    id: "lib_heart",
    name: "Heart",
    tags: ["symbol"],
    svg: sprite(`
      <path d="M50 86 L18 52 Q8 36 22 26 Q36 18 50 32 Q64 18 78 26 Q92 36 82 52 Z"
            fill="#e84a78" stroke="#7a1a40" stroke-width="2"/>`),
  },
  {
    id: "lib_balloon",
    name: "Balloon",
    tags: ["object"],
    svg: sprite(`
      <ellipse cx="50" cy="40" rx="22" ry="28" fill="#7a4ae8"/>
      <ellipse cx="42" cy="32" rx="6" ry="10" fill="#fff" opacity="0.4"/>
      <polygon points="48,68 52,68 50,74" fill="#7a4ae8"/>
      <path d="M50 74 Q44 84 50 96" stroke="#404048" stroke-width="1" fill="none"/>`),
  },
  {
    id: "lib_diamond",
    name: "Diamond",
    tags: ["object", "symbol"],
    svg: sprite(`
      <polygon points="50,12 80,42 50,88 20,42" fill="#5ad8d8" stroke="#1a7878" stroke-width="2"/>
      <polygon points="50,12 80,42 65,42 50,22" fill="#9af0f0" opacity="0.7"/>`),
  },
  {
    id: "lib_arrow",
    name: "Arrow",
    tags: ["symbol"],
    svg: sprite(`
      <polygon points="10,40 60,40 60,20 90,50 60,80 60,60 10,60"
               fill="#3a8af0" stroke="#1a4a90" stroke-width="2"/>`),
  },
  {
    id: "lib_book",
    name: "Book",
    tags: ["object"],
    svg: sprite(`
      <rect x="20" y="20" width="60" height="60" fill="#a04040"/>
      <rect x="22" y="22" width="56" height="56" fill="#cc6060"/>
      <line x1="50" y1="22" x2="50" y2="78" stroke="#7a2020" stroke-width="2"/>
      <line x1="30" y1="36" x2="44" y2="36" stroke="#fff" stroke-width="1"/>
      <line x1="30" y1="44" x2="44" y2="44" stroke="#fff" stroke-width="1"/>
      <line x1="56" y1="36" x2="70" y2="36" stroke="#fff" stroke-width="1"/>
      <line x1="56" y1="44" x2="70" y2="44" stroke="#fff" stroke-width="1"/>`),
  },
  {
    id: "lib_pencil",
    name: "Pencil",
    tags: ["object"],
    svg: sprite(`
      <polygon points="14,80 28,66 86,8 92,14 34,72 20,86" fill="#f0c878"/>
      <polygon points="14,80 28,66 34,72 20,86" fill="#3a3a48"/>
      <polygon points="86,8 92,14 86,20 80,14" fill="#cc4040"/>`),
  },
  {
    id: "lib_lightbulb",
    name: "Light Bulb",
    tags: ["object"],
    svg: sprite(`
      <path d="M30 36 Q30 14 50 14 Q70 14 70 36 Q70 50 60 60 L60 70 L40 70 L40 60 Q30 50 30 36 Z" fill="#f0e040"/>
      <rect x="40" y="70" width="20" height="6" fill="#888"/>
      <rect x="42" y="76" width="16" height="4" fill="#888"/>
      <rect x="44" y="80" width="12" height="3" fill="#888"/>
      <line x1="40" y1="74" x2="60" y2="74" stroke="#404048"/>`),
  },
  {
    id: "lib_key",
    name: "Key",
    tags: ["object"],
    svg: sprite(`
      <circle cx="28" cy="50" r="16" fill="none" stroke="#f0c020" stroke-width="6"/>
      <line x1="44" y1="50" x2="86" y2="50" stroke="#f0c020" stroke-width="6"/>
      <line x1="74" y1="50" x2="74" y2="64" stroke="#f0c020" stroke-width="6"/>
      <line x1="84" y1="50" x2="84" y2="60" stroke="#f0c020" stroke-width="6"/>`),
  },
  {
    id: "lib_flower",
    name: "Flower",
    tags: ["nature"],
    svg: sprite(`
      <line x1="50" y1="58" x2="50" y2="92" stroke="#3a8030" stroke-width="3"/>
      <ellipse cx="36" cy="78" rx="10" ry="5" fill="#3a8030" transform="rotate(-30 36 78)"/>
      <circle cx="50" cy="36" r="10" fill="#f070a0"/>
      <circle cx="34" cy="46" r="10" fill="#f070a0"/>
      <circle cx="66" cy="46" r="10" fill="#f070a0"/>
      <circle cx="40" cy="60" r="10" fill="#f070a0"/>
      <circle cx="60" cy="60" r="10" fill="#f070a0"/>
      <circle cx="50" cy="50" r="8" fill="#f0c020"/>`),
  },
  {
    id: "lib_tree",
    name: "Tree",
    tags: ["nature"],
    svg: sprite(`
      <rect x="44" y="58" width="12" height="34" fill="#5a3010"/>
      <circle cx="50" cy="40" r="22" fill="#3a8030"/>
      <circle cx="34" cy="48" r="14" fill="#4ab048"/>
      <circle cx="66" cy="48" r="14" fill="#4ab048"/>
      <circle cx="50" cy="30" r="14" fill="#4ab048"/>`),
  },
  {
    id: "lib_crown",
    name: "Crown",
    tags: ["object", "fantasy"],
    svg: sprite(`
      <polygon points="14,72 22,32 38,52 50,24 62,52 78,32 86,72" fill="#f0c020" stroke="#a08018" stroke-width="2"/>
      <rect x="14" y="72" width="72" height="10" fill="#f0c020" stroke="#a08018" stroke-width="2"/>
      <circle cx="22" cy="34" r="3" fill="#e84a4a"/>
      <circle cx="50" cy="26" r="3" fill="#7ac848"/>
      <circle cx="78" cy="34" r="3" fill="#3a8af0"/>`),
  },
  {
    id: "lib_music",
    name: "Music Note",
    tags: ["object", "symbol"],
    svg: sprite(`
      <ellipse cx="34" cy="74" rx="12" ry="9" fill="#3a3a48" transform="rotate(-20 34 74)"/>
      <rect x="44" y="20" width="4" height="56" fill="#3a3a48"/>
      <path d="M44 20 Q70 26 70 40 Q60 30 44 32 Z" fill="#3a3a48"/>`),
  },
  {
    id: "lib_sun",
    name: "Sun",
    tags: ["nature", "weather"],
    svg: sprite(`
      <circle cx="50" cy="50" r="22" fill="#f0c020"/>
      <line x1="50" y1="10" x2="50" y2="22" stroke="#f0c020" stroke-width="4"/>
      <line x1="50" y1="78" x2="50" y2="90" stroke="#f0c020" stroke-width="4"/>
      <line x1="10" y1="50" x2="22" y2="50" stroke="#f0c020" stroke-width="4"/>
      <line x1="78" y1="50" x2="90" y2="50" stroke="#f0c020" stroke-width="4"/>
      <line x1="20" y1="20" x2="30" y2="30" stroke="#f0c020" stroke-width="4"/>
      <line x1="70" y1="70" x2="80" y2="80" stroke="#f0c020" stroke-width="4"/>
      <line x1="80" y1="20" x2="70" y2="30" stroke="#f0c020" stroke-width="4"/>
      <line x1="20" y1="80" x2="30" y2="70" stroke="#f0c020" stroke-width="4"/>`),
  },
  {
    id: "lib_moon",
    name: "Moon",
    tags: ["nature", "weather"],
    svg: sprite(`
      <path d="M70 20 Q40 28 40 50 Q40 72 70 80 Q44 80 28 60 Q24 30 70 20 Z" fill="#f4f6fa"/>
      <circle cx="56" cy="38" r="2" fill="#a8b8d0"/>
      <circle cx="50" cy="60" r="2" fill="#a8b8d0"/>
      <circle cx="62" cy="68" r="1.5" fill="#a8b8d0"/>`),
  },
  {
    id: "lib_cloud",
    name: "Cloud",
    tags: ["weather"],
    svg: sprite(`
      <ellipse cx="32" cy="58" rx="18" ry="14" fill="#fff"/>
      <ellipse cx="50" cy="50" rx="22" ry="18" fill="#fff"/>
      <ellipse cx="68" cy="58" rx="18" ry="14" fill="#fff"/>
      <ellipse cx="50" cy="68" rx="30" ry="8" fill="#fff"/>`),
  },
  {
    id: "lib_lightning",
    name: "Lightning",
    tags: ["weather", "symbol"],
    svg: sprite(`
      <polygon points="48,8 30,50 46,50 36,90 70,40 54,40 64,8" fill="#f0c020" stroke="#a08018" stroke-width="2"/>`),
  },
  {
    id: "lib_snowflake",
    name: "Snowflake",
    tags: ["weather"],
    svg: sprite(`
      <line x1="50" y1="14" x2="50" y2="86" stroke="#7ac0f0" stroke-width="3"/>
      <line x1="18" y1="32" x2="82" y2="68" stroke="#7ac0f0" stroke-width="3"/>
      <line x1="82" y1="32" x2="18" y2="68" stroke="#7ac0f0" stroke-width="3"/>
      <line x1="44" y1="20" x2="56" y2="20" stroke="#7ac0f0" stroke-width="2"/>
      <line x1="44" y1="80" x2="56" y2="80" stroke="#7ac0f0" stroke-width="2"/>`),
  },
  {
    id: "lib_plus",
    name: "Plus",
    tags: ["symbol"],
    svg: sprite(`
      <rect x="42" y="14" width="16" height="72" fill="#7ac848"/>
      <rect x="14" y="42" width="72" height="16" fill="#7ac848"/>`),
  },
  {
    id: "lib_check",
    name: "Check",
    tags: ["symbol"],
    svg: sprite(`
      <polyline points="14,52 38,76 86,22" fill="none" stroke="#7ac848" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`),
  },
  {
    id: "lib_smiley",
    name: "Smiley",
    tags: ["symbol"],
    svg: sprite(`
      <circle cx="50" cy="50" r="38" fill="#f0c020" stroke="#a08018" stroke-width="2"/>
      <circle cx="38" cy="42" r="4" fill="#3a3a48"/>
      <circle cx="62" cy="42" r="4" fill="#3a3a48"/>
      <path d="M30 56 Q50 76 70 56" stroke="#3a3a48" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  },
];

// ── backdrops ───────────────────────────────────────────────────────

export const BACKDROP_LIBRARY: LibraryEntry[] = [
  {
    id: "lib_bg_sky",
    name: "Blue Sky",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7ec6f0"/><stop offset="1" stop-color="#cce8f8"/>
      </linearGradient></defs>
      <rect width="480" height="360" fill="url(#g)"/>
      <ellipse cx="80" cy="80" rx="40" ry="14" fill="#fff" opacity="0.85"/>
      <ellipse cx="100" cy="70" rx="30" ry="12" fill="#fff" opacity="0.85"/>
      <ellipse cx="320" cy="120" rx="48" ry="16" fill="#fff" opacity="0.85"/>
      <ellipse cx="350" cy="110" rx="34" ry="14" fill="#fff" opacity="0.85"/>`),
  },
  {
    id: "lib_bg_stars",
    name: "Starry Night",
    tags: ["outdoor", "scene", "fantasy"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#0a1a3a"/>
      ${Array.from({ length: 80 }, (_, i) => {
        const x = (i * 47.3) % 480;
        const y = (i * 31.7) % 360;
        const r = 0.6 + ((i * 13) % 7) * 0.22;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#fff"/>`;
      }).join("")}
      <circle cx="380" cy="60" r="22" fill="#fffbe0"/>`),
  },
  {
    id: "lib_bg_grass",
    name: "Grass Field",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect x="0" y="0" width="480" height="220" fill="#88c8f0"/>
      <rect x="0" y="220" width="480" height="140" fill="#5ab058"/>
      <ellipse cx="240" cy="220" rx="280" ry="14" fill="#3a8a40"/>`),
  },
  {
    id: "lib_bg_beach",
    name: "Beach",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect x="0" y="0" width="480" height="180" fill="#a4dcf8"/>
      <rect x="0" y="180" width="480" height="60" fill="#3a8ad8"/>
      <rect x="0" y="240" width="480" height="120" fill="#f5e6a8"/>
      <circle cx="80" cy="60" r="34" fill="#fff8a8"/>`),
  },
  {
    id: "lib_bg_room",
    name: "Room",
    tags: ["indoor", "scene"],
    svg: backdrop(`
      <rect x="0" y="0" width="480" height="220" fill="#e8d8c0"/>
      <rect x="0" y="220" width="480" height="140" fill="#a87858"/>
      <rect x="60" y="80" width="120" height="100" fill="#7ec0e8" stroke="#604030" stroke-width="6"/>
      <line x1="120" y1="80" x2="120" y2="180" stroke="#604030" stroke-width="3"/>
      <line x1="60" y1="130" x2="180" y2="130" stroke="#604030" stroke-width="3"/>
      <rect x="300" y="60" width="100" height="160" fill="#5a3a20"/>
      <circle cx="380" cy="140" r="3" fill="#ffd633"/>`),
  },
  {
    id: "lib_bg_grid",
    name: "Grid",
    tags: ["abstract"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#f4f6fa"/>
      ${Array.from({ length: 17 }, (_, i) => {
        const x = i * 30;
        return `<line x1="${x}" y1="0" x2="${x}" y2="360" stroke="#cdd6e2" stroke-width="1"/>`;
      }).join("")}
      ${Array.from({ length: 13 }, (_, i) => {
        const y = i * 30;
        return `<line x1="0" y1="${y}" x2="480" y2="${y}" stroke="#cdd6e2" stroke-width="1"/>`;
      }).join("")}
      <line x1="240" y1="0" x2="240" y2="360" stroke="#7898c0" stroke-width="2"/>
      <line x1="0" y1="180" x2="480" y2="180" stroke="#7898c0" stroke-width="2"/>`),
  },
  {
    id: "lib_bg_forest",
    name: "Forest",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#cce8f8"/>
      <polygon points="60,300 110,140 160,300" fill="#1a6a30"/>
      <polygon points="140,300 200,100 260,300" fill="#2a8040"/>
      <polygon points="240,300 290,160 340,300" fill="#1a6a30"/>
      <polygon points="320,300 380,120 440,300" fill="#2a8040"/>
      <rect x="0" y="290" width="480" height="70" fill="#5a3a20"/>`),
  },
  {
    id: "lib_bg_solid_white",
    name: "Plain White",
    tags: ["color"],
    svg: backdrop(`<rect width="480" height="360" fill="#ffffff"/>`),
  },
  {
    id: "lib_bg_solid_black",
    name: "Plain Black",
    tags: ["color"],
    svg: backdrop(`<rect width="480" height="360" fill="#0a0a14"/>`),
  },
  {
    id: "lib_bg_solid_blue",
    name: "Plain Blue",
    tags: ["color"],
    svg: backdrop(`<rect width="480" height="360" fill="#3a8af0"/>`),
  },
  {
    id: "lib_bg_solid_green",
    name: "Plain Green",
    tags: ["color"],
    svg: backdrop(`<rect width="480" height="360" fill="#7ac848"/>`),
  },
  {
    id: "lib_bg_solid_red",
    name: "Plain Red",
    tags: ["color"],
    svg: backdrop(`<rect width="480" height="360" fill="#e84a4a"/>`),
  },
  {
    id: "lib_bg_sunset",
    name: "Sunset",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a3a8a"/>
        <stop offset="0.5" stop-color="#e84a4a"/>
        <stop offset="1" stop-color="#f0c020"/>
      </linearGradient></defs>
      <rect width="480" height="360" fill="url(#s)"/>
      <circle cx="240" cy="240" r="44" fill="#fff8a8"/>
      <rect x="0" y="280" width="480" height="80" fill="#7a3010"/>`),
  },
  {
    id: "lib_bg_city",
    name: "City",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="200" fill="#cce8f8"/>
      <rect x="0" y="200" width="480" height="160" fill="#888898"/>
      <rect x="40" y="120" width="60" height="160" fill="#3a3a58"/>
      <rect x="120" y="80" width="50" height="200" fill="#5a5a78"/>
      <rect x="190" y="160" width="60" height="120" fill="#3a3a58"/>
      <rect x="270" y="60" width="50" height="220" fill="#5a5a78"/>
      <rect x="340" y="140" width="60" height="140" fill="#3a3a58"/>
      <rect x="420" y="100" width="50" height="180" fill="#5a5a78"/>
      ${Array.from({ length: 50 }, (_, i) => {
        const x = 50 + (i * 23) % 400;
        const y = 100 + (i * 17) % 160;
        return `<rect x="${x}" y="${y}" width="6" height="8" fill="#f0c020"/>`;
      }).join("")}`),
  },
  {
    id: "lib_bg_desert",
    name: "Desert",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f5d8a8"/><stop offset="1" stop-color="#e8a868"/>
      </linearGradient></defs>
      <rect width="480" height="200" fill="url(#d)"/>
      <circle cx="380" cy="80" r="38" fill="#f0c020"/>
      <path d="M0 280 Q120 240 260 270 Q380 290 480 260 L480 360 L0 360 Z" fill="#d8a058"/>
      <path d="M0 320 Q140 290 280 310 Q400 320 480 300 L480 360 L0 360 Z" fill="#b8804a"/>`),
  },
  {
    id: "lib_bg_underwater",
    name: "Underwater",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <defs><linearGradient id="u" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7ac0f0"/><stop offset="1" stop-color="#1a4a90"/>
      </linearGradient></defs>
      <rect width="480" height="360" fill="url(#u)"/>
      <ellipse cx="80" cy="50" rx="40" ry="8" fill="#fff" opacity="0.4"/>
      <ellipse cx="280" cy="80" rx="60" ry="10" fill="#fff" opacity="0.3"/>
      <path d="M0 320 L60 280 L120 320 L180 270 L240 320 L300 280 L360 320 L420 270 L480 320 L480 360 L0 360 Z" fill="#5a8030"/>
      ${Array.from({ length: 20 }, (_, i) => {
        const x = (i * 51) % 480;
        const y = 100 + (i * 23) % 200;
        return `<circle cx="${x}" cy="${y}" r="2" fill="#fff" opacity="0.6"/>`;
      }).join("")}`),
  },
  {
    id: "lib_bg_mountains",
    name: "Mountains",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="200" fill="#cce8f8"/>
      <rect x="0" y="200" width="480" height="160" fill="#7ac848"/>
      <polygon points="0,260 120,80 240,260" fill="#7898c0"/>
      <polygon points="80,260 160,40 320,260" fill="#5078a8"/>
      <polygon points="220,260 360,100 480,260" fill="#7898c0"/>
      <polygon points="120,80 100,140 140,140" fill="#fff"/>
      <polygon points="160,40 130,110 190,110" fill="#fff"/>
      <polygon points="360,100 340,150 380,150" fill="#fff"/>`),
  },
  {
    id: "lib_bg_castle",
    name: "Castle",
    tags: ["outdoor", "scene", "fantasy"],
    svg: backdrop(`
      <rect width="480" height="240" fill="#7898c0"/>
      <rect x="0" y="240" width="480" height="120" fill="#5ab058"/>
      <rect x="160" y="100" width="160" height="160" fill="#a8a8b8"/>
      <rect x="120" y="60" width="40" height="200" fill="#888898"/>
      <rect x="320" y="60" width="40" height="200" fill="#888898"/>
      <rect x="200" y="60" width="80" height="200" fill="#888898"/>
      <polygon points="120,60 140,30 160,60" fill="#cc4040"/>
      <polygon points="320,60 340,30 360,60" fill="#cc4040"/>
      <polygon points="200,60 240,20 280,60" fill="#cc4040"/>
      <rect x="220" y="180" width="40" height="80" fill="#3a2010"/>
      <rect x="130" y="120" width="20" height="30" fill="#3a2010"/>
      <rect x="330" y="120" width="20" height="30" fill="#3a2010"/>`),
  },
  {
    id: "lib_bg_space",
    name: "Space",
    tags: ["outdoor", "fantasy"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#0a0a28"/>
      ${Array.from({ length: 120 }, (_, i) => {
        const x = (i * 41.7) % 480;
        const y = (i * 29.3) % 360;
        const r = 0.5 + ((i * 7) % 9) * 0.18;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#fff"/>`;
      }).join("")}
      <circle cx="100" cy="240" r="40" fill="#7898c0"/>
      <circle cx="100" cy="240" r="40" fill="#3a5a8a" opacity="0.5"/>
      <ellipse cx="380" cy="100" rx="50" ry="14" fill="#a06030" opacity="0.7"/>
      <circle cx="380" cy="100" r="22" fill="#c08858"/>`),
  },
  {
    id: "lib_bg_cave",
    name: "Cave",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#3a3030"/>
      <path d="M0 0 L60 80 L120 40 L180 100 L240 60 L300 100 L360 40 L420 80 L480 0 Z" fill="#5a4848"/>
      <path d="M0 360 L60 280 L120 320 L180 260 L240 300 L300 260 L360 320 L420 280 L480 360 Z" fill="#5a4848"/>
      <ellipse cx="240" cy="180" rx="60" ry="40" fill="#1a1010"/>`),
  },
  {
    id: "lib_bg_park",
    name: "Park",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="200" fill="#9eccf0"/>
      <rect x="0" y="200" width="480" height="160" fill="#5ab058"/>
      <rect x="60" y="160" width="20" height="120" fill="#5a3010"/>
      <circle cx="70" cy="150" r="40" fill="#3a8030"/>
      <rect x="380" y="160" width="20" height="120" fill="#5a3010"/>
      <circle cx="390" cy="150" r="40" fill="#3a8030"/>
      <rect x="200" y="240" width="80" height="60" fill="#a06030"/>
      <polygon points="200,240 240,210 280,240" fill="#cc4040"/>
      <rect x="232" y="270" width="16" height="30" fill="#5a3010"/>`),
  },
  {
    id: "lib_bg_snow",
    name: "Snow",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="220" fill="#cce8f8"/>
      <rect x="0" y="220" width="480" height="140" fill="#f4f6fa"/>
      <ellipse cx="240" cy="220" rx="320" ry="14" fill="#dceaf4"/>
      ${Array.from({ length: 30 }, (_, i) => {
        const x = (i * 31) % 480;
        const y = (i * 17) % 200;
        return `<circle cx="${x}" cy="${y}" r="2" fill="#fff"/>`;
      }).join("")}`),
  },
  {
    id: "lib_bg_rainbow",
    name: "Rainbow",
    tags: ["outdoor", "scene", "abstract"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#cce8f8"/>
      <path d="M40 360 Q40 80 240 80 Q440 80 440 360 L420 360 Q420 100 240 100 Q60 100 60 360 Z" fill="#cc2222"/>
      <path d="M60 360 Q60 100 240 100 Q420 100 420 360 L400 360 Q400 120 240 120 Q80 120 80 360 Z" fill="#f08030"/>
      <path d="M80 360 Q80 120 240 120 Q400 120 400 360 L380 360 Q380 140 240 140 Q100 140 100 360 Z" fill="#f0c020"/>
      <path d="M100 360 Q100 140 240 140 Q380 140 380 360 L360 360 Q360 160 240 160 Q120 160 120 360 Z" fill="#7ac848"/>
      <path d="M120 360 Q120 160 240 160 Q360 160 360 360 L340 360 Q340 180 240 180 Q140 180 140 360 Z" fill="#3a8af0"/>
      <path d="M140 360 Q140 180 240 180 Q340 180 340 360 L320 360 Q320 200 240 200 Q160 200 160 360 Z" fill="#7a4ae8"/>`),
  },
  {
    id: "lib_bg_theater",
    name: "Theater",
    tags: ["indoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#2a1018"/>
      <rect x="40" y="20" width="400" height="260" fill="#5a1828"/>
      <path d="M40 20 L40 280 L120 280 L120 20 Z" fill="#a02040"/>
      <path d="M440 20 L440 280 L360 280 L360 20 Z" fill="#a02040"/>
      <path d="M40 20 Q240 80 440 20 L440 60 Q240 120 40 60 Z" fill="#cc3050"/>
      <rect x="0" y="280" width="480" height="80" fill="#3a1820"/>
      <rect x="0" y="280" width="480" height="20" fill="#5a3030"/>`),
  },
  {
    id: "lib_bg_stadium",
    name: "Stadium",
    tags: ["outdoor", "scene", "sport"],
    svg: backdrop(`
      <rect width="480" height="180" fill="#7898c0"/>
      <rect x="0" y="180" width="480" height="40" fill="#888898"/>
      <rect x="0" y="220" width="480" height="140" fill="#5ab058"/>
      <line x1="240" y1="220" x2="240" y2="360" stroke="#fff" stroke-width="3"/>
      <circle cx="240" cy="290" r="40" fill="none" stroke="#fff" stroke-width="3"/>
      <rect x="0" y="280" width="40" height="20" fill="none" stroke="#fff" stroke-width="3"/>
      <rect x="440" y="280" width="40" height="20" fill="none" stroke="#fff" stroke-width="3"/>`),
  },
  {
    id: "lib_bg_school",
    name: "School",
    tags: ["indoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="240" fill="#e8d8a8"/>
      <rect x="0" y="240" width="480" height="120" fill="#a87858"/>
      <rect x="40" y="40" width="400" height="180" fill="#1a3030"/>
      <rect x="40" y="40" width="400" height="180" fill="none" stroke="#5a4030" stroke-width="6"/>
      <line x1="60" y1="80" x2="180" y2="80" stroke="#fff" stroke-width="2"/>
      <line x1="60" y1="100" x2="160" y2="100" stroke="#fff" stroke-width="2"/>
      <line x1="60" y1="120" x2="200" y2="120" stroke="#fff" stroke-width="2"/>
      <text x="220" y="180" font-family="serif" font-size="60" fill="#fff">A+</text>`),
  },
  {
    id: "lib_bg_kitchen",
    name: "Kitchen",
    tags: ["indoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="220" fill="#f0e8d8"/>
      <rect x="0" y="220" width="480" height="140" fill="#a87858"/>
      <rect x="40" y="180" width="400" height="60" fill="#3a3a48"/>
      <rect x="60" y="190" width="60" height="40" fill="#a8a8b8"/>
      <circle cx="90" cy="210" r="6" fill="#000"/>
      <circle cx="160" cy="210" r="6" fill="#cc4040"/>
      <circle cx="200" cy="210" r="6" fill="#cc4040"/>
      <rect x="240" y="190" width="60" height="40" fill="#a8a8b8"/>
      <rect x="320" y="40" width="120" height="120" fill="#3a3a48"/>
      <rect x="330" y="50" width="100" height="100" fill="#7898c0"/>`),
  },
  {
    id: "lib_bg_library",
    name: "Library",
    tags: ["indoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#a86a3e"/>
      <rect x="20" y="40" width="80" height="280" fill="#cc8a5a"/>
      <rect x="120" y="40" width="80" height="280" fill="#cc8a5a"/>
      <rect x="280" y="40" width="80" height="280" fill="#cc8a5a"/>
      <rect x="380" y="40" width="80" height="280" fill="#cc8a5a"/>
      ${Array.from({ length: 4 }, (_, shelf) =>
        Array.from({ length: 16 }, (_, b) => {
          const x = [30, 130, 290, 390][shelf] + b * 4;
          const colors = ["#a04040", "#a08020", "#3a8a40", "#3a8af0", "#7a4ae8", "#cc4040"];
          const c = colors[(shelf * 16 + b) % colors.length];
          const h = 30 + ((shelf * 16 + b) % 4) * 6;
          return `<rect x="${x}" y="${280 - h}" width="3" height="${h}" fill="${c}"/>`;
        }).join(""),
      ).join("")}`),
  },
  {
    id: "lib_bg_farm",
    name: "Farm",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <rect width="480" height="200" fill="#9eccf0"/>
      <rect x="0" y="200" width="480" height="160" fill="#7ac848"/>
      <rect x="80" y="140" width="160" height="120" fill="#cc4040"/>
      <polygon points="80,140 160,80 240,140" fill="#7a2020"/>
      <rect x="140" y="190" width="40" height="70" fill="#5a3010"/>
      <rect x="100" y="170" width="20" height="20" fill="#fff"/>
      <rect x="200" y="170" width="20" height="20" fill="#fff"/>
      <line x1="280" y1="220" x2="460" y2="220" stroke="#5a3010" stroke-width="3"/>
      <line x1="280" y1="240" x2="460" y2="240" stroke="#5a3010" stroke-width="3"/>
      ${Array.from({ length: 6 }, (_, i) => {
        const x = 290 + i * 30;
        return `<line x1="${x}" y1="200" x2="${x}" y2="260" stroke="#5a3010" stroke-width="3"/>`;
      }).join("")}`),
  },
  {
    id: "lib_bg_jungle",
    name: "Jungle",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <defs><linearGradient id="j" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5aa848"/><stop offset="1" stop-color="#1a5028"/>
      </linearGradient></defs>
      <rect width="480" height="360" fill="url(#j)"/>
      ${Array.from({ length: 8 }, (_, i) => {
        const x = i * 60 + 20;
        const h = 80 + (i * 23) % 80;
        return `<rect x="${x}" y="${360 - h}" width="14" height="${h}" fill="#3a2010"/>` +
               `<circle cx="${x + 7}" cy="${360 - h - 20}" r="40" fill="#3a8030"/>`;
      }).join("")}
      <path d="M0 320 Q120 280 240 320 Q360 280 480 320 L480 360 L0 360 Z" fill="#1a3018"/>`),
  },
  {
    id: "lib_bg_volcano",
    name: "Volcano",
    tags: ["outdoor", "scene"],
    svg: backdrop(`
      <defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a1818"/><stop offset="1" stop-color="#7a2010"/>
      </linearGradient></defs>
      <rect width="480" height="360" fill="url(#v)"/>
      <polygon points="80,360 240,100 400,360" fill="#3a3030"/>
      <polygon points="200,160 240,100 280,160 290,180 190,180" fill="#cc4020"/>
      <ellipse cx="240" cy="100" rx="40" ry="14" fill="#f0c020"/>
      <path d="M210 100 Q200 60 220 30 Q240 50 230 90" fill="#f08030" opacity="0.7"/>
      <path d="M260 100 Q280 60 270 30 Q250 60 270 90" fill="#f0c020" opacity="0.7"/>
      ${Array.from({ length: 12 }, (_, i) => {
        const x = 100 + (i * 31) % 280;
        const y = 200 + (i * 17) % 100;
        return `<circle cx="${x}" cy="${y}" r="3" fill="#f0c020"/>`;
      }).join("")}`),
  },
  {
    id: "lib_bg_checker",
    name: "Checkerboard",
    tags: ["abstract"],
    svg: backdrop(`
      <rect width="480" height="360" fill="#fff"/>
      ${Array.from({ length: 12 }, (_, row) =>
        Array.from({ length: 16 }, (_, col) => {
          if ((row + col) % 2 === 0) return "";
          return `<rect x="${col * 30}" y="${row * 30}" width="30" height="30" fill="#1a1a28"/>`;
        }).join(""),
      ).join("")}`),
  },
];

/** Convert an inline SVG string to a `data:` URL the costume/backdrop
 *  pipeline can store inline. We use base64 because the costume cache
 *  + image decoder accept either form, and base64 avoids URL-encoding
 *  every special character in the SVG markup. */
export function svgToDataUrl(svg: string): string {
  const trimmed = svg.trim();
  // The studio runs in a Tauri webview, so `btoa` is always present —
  // no Node fallback needed. `unescape(encodeURIComponent(...))` keeps
  // any future non-ASCII chars in the SVG strings safe.
  const encoded = btoa(unescape(encodeURIComponent(trimmed)));
  return `data:image/svg+xml;base64,${encoded}`;
}

/** Aggregate the union of tags across the catalog so the LibraryDialog
 *  can render its filter chips without each call site enumerating them. */
export function tagsFor(kind: "sprite" | "backdrop"): string[] {
  const list = kind === "sprite" ? SPRITE_LIBRARY : BACKDROP_LIBRARY;
  const seen = new Set<string>();
  for (const e of list) for (const t of e.tags) seen.add(t);
  return [...seen].sort();
}
