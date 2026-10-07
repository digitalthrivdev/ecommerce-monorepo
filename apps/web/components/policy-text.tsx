import type { ReactNode } from "react";

type Block = { type: "heading"; text: string } | { type: "paragraph"; text: string } | { type: "list"; items: string[] };

/** "## " starts a heading, "- " a list item, and a blank line ends a paragraph. */
function parse(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      endParagraph();
    } else if (line.startsWith("## ")) {
      endParagraph();
      blocks.push({ type: "heading", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      endParagraph();
      const last = blocks.at(-1);
      if (last?.type === "list") last.items.push(line.slice(2).trim());
      else blocks.push({ type: "list", items: [line.slice(2).trim()] });
    } else {
      paragraph.push(line);
    }
  }
  endParagraph();
  return blocks;
}

const LINKABLE = /(https?:\/\/[^\s]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function withLinks(text: string): ReactNode[] {
  return text.split(LINKABLE).map((part, index) => {
    if (index % 2 === 0) return part;
    const href = part.includes("@") && !part.startsWith("http") ? `mailto:${part}` : part;
    return (
      <a key={index} href={href} className="font-medium text-primary-ink underline underline-offset-4">
        {part}
      </a>
    );
  });
}

export function PolicyText({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-4 text-[15px] leading-7">
      {parse(body).map((block, index) => {
        if (block.type === "heading") {
          return (
            <h2 key={index} className="mt-4 text-lg font-semibold">
              {block.text}
            </h2>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="flex list-disc flex-col gap-1.5 pl-6 marker:text-muted-foreground">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{withLinks(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{withLinks(block.text)}</p>;
      })}
    </div>
  );
}
