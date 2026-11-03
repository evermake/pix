import { isLineBreakAmbiguous } from "./prettier-whitespace.mjs";

const proseTypes = new Set(["paragraph", "setextHeadingText"]);
const prefixTypes = new Set([
  "blockQuotePrefix",
  "listItemIndent",
  "gfmFootnoteDefinitionIndent",
  "linePrefix",
]);
const hardBreakTypes = new Set(["hardBreakEscape", "hardBreakTrailing"]);

function* descendants(token) {
  for (const child of token.children) {
    yield child;
    yield* descendants(child);
  }
}

function hasAncestor(token, type, root) {
  for (let parent = token.parent; parent && parent !== root; parent = parent.parent) {
    if (parent.type === type) {
      return true;
    }
  }
  return false;
}

function visibleText(token, prose) {
  // Syntax delimiters and link destinations are not the characters adjacent to
  // a rendered prose break. Inspect text leaves, including inside emphasis.
  if (hasAncestor(token, "resource", prose) || hasAncestor(token, "reference", prose)) {
    return "";
  }
  if (["data", "codeTextData", "characterEscapeValue"].includes(token.type)) {
    return token.text;
  }
  if (token.type === "characterReference") {
    const numeric = token.text.match(/^&#(x[\da-f]+|\d+);$/i);
    if (numeric) {
      const value = numeric[1];
      const point = /^x/i.test(value) ? Number.parseInt(value.slice(1), 16) : Number(value);
      return String.fromCodePoint(point <= 0x10ffff ? point : 0xfffd);
    }
    // Named HTML references do not encode CJ letters. Keep their source as a
    // non-CJ boundary; numeric references above may contain any Unicode letter.
    return token.text;
  }
  return "";
}

function checkProse(prose, lines, onError) {
  const tokens = [...descendants(prose)];
  // HTML may contain whitespace-sensitive content or markdownlint directives.
  // Unlike a full HTML formatter, this rule cannot prove such joins safe.
  if (tokens.some((token) => token.type === "htmlText")) {
    return;
  }

  const prefixes = new Map();
  const suffixes = new Map();
  const hardBreaks = new Set();
  const textByLine = new Map();
  for (const token of tokens) {
    const text = visibleText(token, prose);
    if (text) {
      textByLine.set(token.startLine, (textByLine.get(token.startLine) ?? "") + text);
    }
    if (prefixTypes.has(token.type)) {
      prefixes.set(token.startLine, Math.max(prefixes.get(token.startLine) ?? 0, token.endColumn - 1));
    } else if (token.type === "lineSuffix" && token.endColumn === lines[token.startLine - 1].length + 1) {
      suffixes.set(token.startLine, token.startColumn - 1);
    } else if (hardBreakTypes.has(token.type)) {
      hardBreaks.add(token.startLine);
    }
  }

  const joins = new Map();
  for (const token of tokens) {
    if (token.type !== "lineEnding" || hardBreaks.has(token.startLine)) {
      continue;
    }
    // Literal newlines in attribute values are not prose wraps. Preserve link
    // titles and image alt text rather than rewriting their rendered values.
    if (hasAncestor(token, "resourceTitle", prose) ||
        (hasAncestor(token, "image", prose) && hasAncestor(token, "label", prose))) {
      continue;
    }
    const line = token.startLine;
    const code = hasAncestor(token, "codeText", prose);
    const leftEnd = code ? lines[line - 1].length : (suffixes.get(line) ?? lines[line - 1].length);
    const rightStart = prefixes.get(line + 1) ?? 0;
    const before = lines[line - 1].slice(0, leftEnd);
    const after = lines[line].slice(rightStart);
    // Parsers disagree about deeply indented quote markers on lazy quote
    // continuations. Do not turn a possible container marker into literal text.
    if (!code && after.startsWith(">") && hasAncestor(prose, "blockQuote")) {
      continue;
    }
    // Prettier also always replaces inline-code newlines with spaces. Keep the
    // code's own padding; remove only parser-identified container prefixes.
    const syntaxWhitespace = hasAncestor(token, "resource", prose) || hasAncestor(token, "reference", prose);
    if (!code && !syntaxWhitespace &&
        isLineBreakAmbiguous(textByLine.get(line) ?? before, textByLine.get(line + 1) ?? after)) {
      continue;
    }
    joins.set(line, { leftEnd, rightStart });
  }

  for (const [start, firstJoin] of joins) {
    let end = start;
    let replacement = lines[start - 1].slice(0, firstJoin.leftEnd);
    while (joins.has(end)) {
      const { rightStart } = joins.get(end);
      end++;
      const nextJoin = joins.get(end);
      replacement += " " + lines[end - 1].slice(rightStart, nextJoin?.leftEnd);
      joins.delete(end - 1);
    }

    const detail = `Join prose lines ${start}-${end}; leave wrapping to the viewer`;
    // markdownlint fixes are single-line edits. Anchor every edit's diagnostic
    // to the same line so disable-next-line cannot suppress only half a fix
    // and cause duplicated or deleted prose. fixInfo targets each actual line.
    onError({
      lineNumber: start,
      detail,
      fixInfo: { lineNumber: start, editColumn: 1, deleteCount: lines[start - 1].length, insertText: replacement },
    });
    for (let line = start + 1; line <= end; line++) {
      onError({ lineNumber: start, detail, fixInfo: { lineNumber: line, deleteCount: -1 } });
    }
  }
}

/** @type {import("markdownlint").Rule} */
export default {
  names: ["no-soft-wrap"],
  description: "Prose must not contain unnecessary line breaks",
  tags: ["line_length"],
  parser: "micromark",
  function(params, onError) {
    const visit = (tokens) => {
      for (const token of tokens) {
        // markdownlint exposes parsed Markdown children inside HTML blocks,
        // including unfinished tags and CDATA. They are still raw HTML source.
        if (token.type === "htmlFlow") {
          continue;
        } else if (proseTypes.has(token.type)) {
          checkProse(token, params.lines, onError);
        } else {
          visit(token.children);
        }
      }
    };
    visit(params.parsers.micromark.tokens);
  },
};
