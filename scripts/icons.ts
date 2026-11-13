// Generates src/icons/catalog.ts: the curated icon subset merfolk ships.
// Run with: npm run icons
//
// Artwork is copied from two Iconify packs so the full packs never reach the
// bundle: Lucide (ISC) for generic concepts, Simple Icons (CC0) for brands. Ids
// are full Iconify names, which is also what the Mermaid export writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface Pack {
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
}

const load = (name: string): Pack =>
  JSON.parse(readFileSync(require.resolve(`@iconify-json/${name}/icons.json`), 'utf8'));

// [icon name in the pack, display name]
const TECH: [string, string][] = [
  ['user', 'User'],
  ['users', 'Users'],
  ['server', 'Server'],
  ['database', 'Database'],
  ['cloud', 'Cloud'],
  ['globe', 'Internet'],
  ['monitor', 'Desktop'],
  ['laptop', 'Laptop'],
  ['smartphone', 'Phone'],
  ['hard-drive', 'Storage'],
  ['cpu', 'CPU'],
  ['network', 'Network'],
  ['router', 'Router'],
  ['shield', 'Security'],
  ['lock', 'Lock'],
  ['key', 'Key'],
  ['mail', 'Mail'],
  ['message-square', 'Message'],
  ['bell', 'Notification'],
  ['file', 'File'],
  ['folder', 'Folder'],
  ['code', 'Code'],
  ['terminal', 'Terminal'],
  ['git-branch', 'Branch'],
  ['box', 'Package'],
  ['container', 'Container'],
  ['layers', 'Queue'],
  ['zap', 'Function'],
  ['webhook', 'Webhook'],
  ['settings', 'Service'],
  ['bot', 'Bot'],
];

const BRANDS: [string, string][] = [
  ['github', 'GitHub'],
  ['gitlab', 'GitLab'],
  ['x', 'X'],
  ['linkedin', 'LinkedIn'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['threads', 'Threads'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
  ['twitch', 'Twitch'],
  ['discord', 'Discord'],
  ['slack', 'Slack'],
  ['reddit', 'Reddit'],
  ['whatsapp', 'WhatsApp'],
  ['telegram', 'Telegram'],
  ['google', 'Google'],
  ['apple', 'Apple'],
  ['android', 'Android'],
  ['amazonwebservices', 'AWS'],
  ['googlecloud', 'Google Cloud'],
  ['docker', 'Docker'],
  ['kubernetes', 'Kubernetes'],
  ['nginx', 'Nginx'],
  ['postgresql', 'PostgreSQL'],
  ['mysql', 'MySQL'],
  ['mongodb', 'MongoDB'],
  ['redis', 'Redis'],
  ['nodedotjs', 'Node.js'],
  ['python', 'Python'],
  ['stripe', 'Stripe'],
  ['notion', 'Notion'],
];

// AI: generic concepts (Lucide) first, then model makers and AI tooling
// (Simple Icons). Full ids here because the section mixes both packs.
const AI: [string, string][] = [
  ['lucide:sparkles', 'AI'],
  ['lucide:brain', 'Model'],
  ['lucide:brain-circuit', 'Neural network'],
  ['lucide:bot-message-square', 'Chatbot'],
  ['lucide:wand-sparkles', 'Generate'],
  ['simple-icons:openai', 'OpenAI'],
  ['simple-icons:claude', 'Claude'],
  ['simple-icons:anthropic', 'Anthropic'],
  ['simple-icons:googlegemini', 'Gemini'],
  ['simple-icons:deepseek', 'DeepSeek'],
  ['simple-icons:metaai', 'Meta AI'],
  ['simple-icons:mistralai', 'Mistral AI'],
  ['simple-icons:qwen', 'Qwen'],
  ['simple-icons:kimi', 'Kimi'],
  ['simple-icons:minimax', 'MiniMax'],
  ['simple-icons:perplexity', 'Perplexity'],
  ['simple-icons:githubcopilot', 'GitHub Copilot'],
  ['logos:kiro', 'Kiro'],
  ['simple-icons:cursor', 'Cursor'],
  ['simple-icons:huggingface', 'Hugging Face'],
  ['simple-icons:ollama', 'Ollama'],
  ['simple-icons:vllm', 'vLLM'],
  ['simple-icons:openrouter', 'OpenRouter'],
  ['simple-icons:langchain', 'LangChain'],
  ['simple-icons:n8n', 'n8n'],
  ['simple-icons:nvidia', 'NVIDIA'],
];

// Icons missing from the installed packs. Bodies are 24x24 and tint with currentColor.
// Kiro: Iconify `logos:kiro`, rescaled from 256x312 to fit 24x24; the eyes are
// cut out of the ghost (evenodd) so the node colour shows through.
const CUSTOM: Record<string, string> = {
  'logos:kiro': '<g transform="translate(2.15 0) scale(0.0769)"><path fill="currentColor" fill-rule="evenodd" d="M49.375 241.177c-32.186 71.33 36.35 89.215 86.9 47.471c14.854 46.813 70.609 11.894 90.603-24.37c44.07-79.928 26.273-161.466 21.705-178.285c-31.328-114.698-187.91-114.812-214.86.585c-6.294 20.194-6.404 43.162-9.969 67.009c-1.797 12.025-3.064 19.7-7.717 32.348c-2.676 7.272-6.357 13.73-12.14 24.612c-8.982 16.904-5.192 49.53 41.103 32.61v.012zM142.393 135.634c-12.853 0-14.772-15.359-14.772-24.515c0-8.264 1.48-14.83 4.286-18.993c2.467-3.663 5.996-5.52 10.486-5.52s8.342 1.887 11.06 5.61c3.095 4.243 4.73 10.778 4.73 18.903c0 15.352-5.902 24.515-15.788 24.515zm52.875 0c-12.854 0-14.774-15.359-14.774-24.515c0-8.264 1.482-14.83 4.287-18.993c2.467-3.663 5.996-5.52 10.487-5.52s8.34 1.887 11.058 5.61c3.096 4.243 4.733 10.778 4.733 18.903c0 15.352-5.903 24.515-15.79 24.515z"/></g>',
};

type Group = 'tech' | 'ai' | 'brand';

/** `list` holds full `pack:name` ids */
function pick(group: Group, list: [string, string][]) {
  const packs = new Map<string, Pack>();
  return list.map(([id, name]) => {
    if (CUSTOM[id]) return { id, name, group, body: CUSTOM[id] };
    const [packName, key] = id.split(':');
    if (!packs.has(packName)) packs.set(packName, load(packName));
    const pack = packs.get(packName)!;
    const icon = pack.icons[key] ?? pack.icons[pack.aliases?.[key]?.parent ?? ''];
    if (!icon) throw new Error(`icon "${id}" is missing from the pack`);
    return { id, name, group, body: icon.body };
  });
}

const prefix = (pack: string, list: [string, string][]): [string, string][] =>
  list.map(([key, name]) => [`${pack}:${key}`, name]);

const entries = [
  ...pick('tech', prefix('lucide', TECH)),
  ...pick('ai', AI),
  ...pick('brand', prefix('simple-icons', BRANDS)),
];

const out = `// GENERATED by scripts/icons.ts — do not edit; run \`npm run icons\`.
// Lucide icons: ISC license. Simple Icons: CC0. Each body is 24x24 SVG markup.

export interface IconEntry {
  /** full Iconify name, also what the Mermaid export writes */
  id: string;
  name: string;
  group: 'tech' | 'ai' | 'brand';
  body: string;
}

export const ICONS: IconEntry[] = ${JSON.stringify(entries, null, 2)};

export const ICON_BY_ID: ReadonlyMap<string, IconEntry> = new Map(ICONS.map((i) => [i.id, i]));
`;

const target = new URL('../src/icons/catalog.ts', import.meta.url);
writeFileSync(target, out);
console.log(`wrote ${entries.length} icons to src/icons/catalog.ts`);
