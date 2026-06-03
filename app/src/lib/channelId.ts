import { pinyin } from "pinyin-pro";

/** 将频道显示名称转为 config.channels 用的 id（小写、连字符分隔） */
export function slugifyChannelId(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";

  const segments: string[] = [];
  let asciiRun = "";

  const flushAscii = () => {
    if (!asciiRun) return;
    const slug = asciiRun
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
    if (slug) segments.push(slug);
    asciiRun = "";
  };

  for (const char of trimmed) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      flushAscii();
      const py = pinyin(char, { toneType: "none" }).trim().toLowerCase();
      if (py) segments.push(py.replace(/[^a-z0-9]/g, ""));
    } else {
      asciiRun += char;
    }
  }
  flushAscii();

  return segments
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
