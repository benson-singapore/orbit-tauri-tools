import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const languages: Array<[string, Parameters<typeof hljs.registerLanguage>[1]]> = [
  ["bash", bash],
  ["css", css],
  ["go", go],
  ["java", java],
  ["javascript", javascript],
  ["js", javascript],
  ["json", json],
  ["markdown", markdown],
  ["md", markdown],
  ["python", python],
  ["py", python],
  ["rust", rust],
  ["rs", rust],
  ["shell", shell],
  ["sh", shell],
  ["sql", sql],
  ["typescript", typescript],
  ["ts", typescript],
  ["tsx", typescript],
  ["jsx", javascript],
  ["xml", xml],
  ["html", xml],
  ["yaml", yaml],
  ["yml", yaml],
];

for (const [name, lang] of languages) {
  hljs.registerLanguage(name, lang);
}

function languageFromClassName(className: string): string | undefined {
  for (const token of className.split(/\s+/)) {
    const match = token.match(/^language-([a-z0-9+#-]+)$/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }
  return undefined;
}

function wrapPlainPreWithCode(pre: HTMLPreElement): HTMLElement | null {
  if (pre.querySelector("code")) {
    return null;
  }
  const text = pre.textContent?.trim();
  if (!text) {
    return null;
  }
  const code = document.createElement("code");
  code.textContent = text;
  pre.textContent = "";
  pre.appendChild(code);
  return code;
}

/** Highlight code blocks that RSS HTML did not already mark up with hljs. */
export function highlightArticleCode(root: HTMLElement | null): void {
  if (!root) return;

  root.querySelectorAll("pre").forEach(pre => {
    const block = wrapPlainPreWithCode(pre as HTMLPreElement);
    const code =
      block ?? (pre.querySelector("code") as HTMLElement | null);
    if (!code || code.classList.contains("hljs")) {
      return;
    }

    const language = languageFromClassName(code.className);
    if (language && hljs.getLanguage(language)) {
      code.classList.add("language-" + language);
    }

    hljs.highlightElement(code);
  });
}
