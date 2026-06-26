import type { ReactNode } from "react";
import type { Article, SocialMedia } from "@/types";

type ProseMirrorNode = {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string; attrs?: { href?: string } }>;
  content?: ProseMirrorNode[];
};

function renderProseMirrorNodes(nodes: ProseMirrorNode[] | undefined): ReactNode[] {
  if (!nodes?.length) return [];
  const out: ReactNode[] = [];
  nodes.forEach((node, index) => {
    if (node.type === "text") {
      const text = node.text ?? "";
      const linkMark = node.marks?.find(mark => mark.type === "link");
      if (linkMark?.attrs?.href) {
        out.push(
          <a
            key={`link-${index}`}
            href={linkMark.attrs.href}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--orbit-accent)] hover:underline"
          >
            {text}
          </a>,
        );
        return;
      }
      const bold = node.marks?.some(mark => mark.type === "bold");
      out.push(
        bold ? <strong key={`text-${index}`}>{text}</strong> : <span key={`text-${index}`}>{text}</span>,
      );
      return;
    }
    if (node.type === "paragraph") {
      const children = renderProseMirrorNodes(node.content);
      out.push(
        <p key={`p-${index}`} className="whitespace-pre-wrap leading-relaxed">
          {children.length > 0 ? children : <br />}
        </p>,
      );
      return;
    }
    if (node.content?.length) {
      out.push(...renderProseMirrorNodes(node.content));
    }
  });
  return out;
}

export function renderSocialNoteBody(article: Pick<Article, "content" | "summary">): ReactNode {
  const raw = article.content?.trim();
  if (raw?.startsWith("{")) {
    try {
      const doc = JSON.parse(raw) as { content?: ProseMirrorNode[] };
      const rendered = renderProseMirrorNodes(doc.content);
      if (rendered.length > 0) {
        return <div className="space-y-2 text-sm leading-relaxed">{rendered}</div>;
      }
    } catch {
      // fall through to plain text
    }
  }
  const text = raw || article.summary || "";
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>;
}

export function pickPrimarySocialImage(media?: SocialMedia[]): string | undefined {
  if (!media?.length) return undefined;
  for (const item of media) {
    if (item.type === "image" && item.url) return item.url;
    if (item.thumbnail) return item.thumbnail;
  }
  return undefined;
}
