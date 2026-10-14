export type RichBlock =
  { type: "heading"; text: string } | { type: "paragraph"; lines: string[] };

/**
 * Minimal, safe text format for long admin texts (legal pages): blank lines
 * separate paragraphs, "## " starts a heading. No HTML is ever interpreted;
 * React renders every piece as plain text.
 */
export function parseRichText(input: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const chunk of input.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
      paragraph = [];
    };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        blocks.push({ type: "heading", text: line.slice(3).trim() });
      } else paragraph.push(line);
    }
    flush();
  }
  return blocks;
}
