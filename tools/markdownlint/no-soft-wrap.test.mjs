import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/sync";
import rule from "./no-soft-wrap.mjs";

const markdown = new MarkdownIt({ html: true });
// Compare rendered semantics, treating a soft break as a viewer's whitespace.
markdown.renderer.rules.softbreak = () => " ";

function check(input, expected, { render = true } = {}) {
  const options = {
    customRules: [rule],
    config: { default: false, "no-soft-wrap": true },
  };
  const errors = lint({ ...options, strings: { content: input } }).content;
  assert.equal(errors.length > 0, input !== expected);
  const fixed = applyFixes(input, errors);
  assert.equal(fixed, expected);
  assert.deepEqual(lint({ ...options, strings: { content: fixed } }).content, []);
  if (render) {
    assert.equal(markdown.render(fixed), markdown.render(input));
  }
}

const cases = [
  ["paragraph", "One wrapped\nparagraph.\n", "One wrapped paragraph.\n"],
  ["long run", "One\ntwo\nthree\nfour\n", "One two three four\n"],
  ["separate paragraphs", "One\nparagraph.\n\nAnother\nparagraph.\n", "One paragraph.\n\nAnother paragraph.\n"],
  ["already unwrapped", "A single line.\n\nAnother paragraph.\n"],
  ["no final newline", "One\ntwo", "One two"],
  ["CRLF", "One\r\ntwo\r\n", "One two\r\n"],
  ["frontmatter", "---\ntitle: Test\n---\n\nOne\ntwo\n", "---\ntitle: Test\n---\n\nOne two\n", { render: false }],
  ["indentation", "One \n   two\n", "One two\n"],
  ["nonbreaking space", "One\u00a0\ntwo\n", "One\u00a0 two\n"],
  ["unordered lists", "- One\n  two\n- Three\n  four\n", "- One two\n- Three four\n"],
  ["ordered lists", "1. One\n   two\n2. Three\n   four\n", "1. One two\n2. Three four\n"],
  ["nested lists", "- One\n  two\n  - Three\n    four\n", "- One two\n  - Three four\n"],
  ["list paragraphs", "- One\n  two\n\n  Three\n  four\n", "- One two\n\n  Three four\n"],
  ["lazy continuation", "> One\ntwo\n", "> One two\n"],
  ["ambiguous quote marker", "> One\n    > two\n"],
  ["ambiguous quote marker after entity", "> One &#10;\n    > two\n"],
  ["quotes", "> One\n> two\n>\n> Three\n> four\n", "> One two\n>\n> Three four\n"],
  ["nested containers", "> - One\n>   two\n>   > Three\n>   > four\n", "> - One two\n>   > Three four\n"],
  ["tab indentation", "- One\n\ttwo\n", "- One two\n"],
  ["task lists", "- [ ] One\n  two\n- [x] Three\n  four\n", "- [ ] One two\n- [x] Three four\n"],
  ["hard break spaces", "One  \ntwo\nthree\n", "One  \ntwo three\n"],
  ["hard break escape", "One\\\ntwo\nthree\n", "One\\\ntwo three\n"],
  ["soft before hard break", "One\ntwo  \nthree\nfour\n", "One two  \nthree four\n"],
  ["escaped backslash", "One\\\\\ntwo\n", "One\\\\ two\n"],
  ["hard break in quote", "> One  \n> two\n> three\n", "> One  \n> two three\n"],
  ["emphasis", "One *two\nthree* and **four\nfive**.\n", "One *two three* and **four five**.\n"],
  ["code span", "One `two\nthree`.\n", "One `two three`.\n"],
  ["code span spaces", "`one  \n  two`\n", "`one     two`\n"],
  ["code span in quote", "> `one \n>  two`\n", "> `one   two`\n"],
  ["code span CJK", "`中文\n中文`\n", "`中文 中文`\n"],
  ["link label", "[One\ntwo](https://example.com)\n", "[One two](https://example.com)\n"],
  ["image alt semantics", "![One\ntwo](image.png)\n"],
  ["prose around image", "One\ntwo ![alt\ntext](image.png) three\nfour\n", "One two ![alt\ntext](image.png) three four\n"],
  ["reference label", "[One\ntwo][ref\nlabel]\n\n[ref label]: /url\n", "[One two][ref label]\n\n[ref label]: /url\n"],
  ["link resource whitespace", "[One](\n/url\n)\n", "[One]( /url )\n"],
  ["link title semantics", "[One](url \"a\ntitle\")\n"],
  ["adjacent titled links", "[One](url \"title\")\n[Two](url 'title')\n[Three](url (title))\n", "[One](url \"title\") [Two](url 'title') [Three](url (title))\n"],
  ["footnote", "[^note]: One\n    two\n\nUse[^note].\n", "[^note]: One two\n\nUse[^note].\n", { render: false }],
  ["setext heading", "One\ntwo\n---\n", "One two\n---\n"],
  ["ATX headings", "# Heading\n\nOne\ntwo\n\n## Heading\n", "# Heading\n\nOne two\n\n## Heading\n"],
  ["structural blocks", "# Title\n\n- One\n- Two\n\n> Quote\n\n---\n"],
  ["fenced code", "```md\nOne\ntwo\n```\n"],
  ["indented code", "    One\n    two\n"],
  ["table", "| A | B |\n| - | - |\n| C | D |\n"],
  ["HTML block", "<pre>\nOne\ntwo\n</pre>\n"],
  ["Markdown-like HTML content", "<div>\nOne\ntwo\n</div>\n"],
  ["unfinished HTML block", "<div id=\"foo\"\n*hi*\n"],
  ["CDATA", "<![CDATA[\nfunction match(a, b)\n{\n  return 1;\n\n}\n]]>\n"],
  ["inline HTML", "One <span style=\"white-space: pre\">two\nthree</span>.\n"],
  ["multiline HTML attributes", "One <span\ntitle=\"a\nb\">two</span>.\n"],
  ["reference definition", "[ref]: /url\n  \"a\ntitle\"\n"],
  ["CJK ambiguity", "中文\n中文\n"],
  ["CJK punctuation", "中文。\nEnglish\n"],
  ["CJK and Latin", "中文\nEnglish\n"],
  ["CJK inside emphasis", "*中文*\n*中文*\n"],
  ["CJK inside links", "[中文](/url)\n[中文](/url)\n"],
  ["CJK numeric references", "&#20013;\n&#x6587;\n"],
  ["CJK inside code next to prose", "`中文`\n中文\n"],
  ["Korean", "한글\n문장\n", "한글 문장\n"],
  ["CJK and Korean", "中文\n한글\n", "中文 한글\n"],
  ["mixed safe and ambiguous", "One\ntwo 中文\n中文 end\nnext\n", "One two 中文\n中文 end next\n"],
  ["disable directive", "<!-- markdownlint-disable no-soft-wrap -->\nOne\ntwo\n"],
  ["disable-next-line atomic fix", "<!-- markdownlint-disable-next-line no-soft-wrap -->\nOne\ntwo\nthree\n"],
  ["reenable directive", "<!-- markdownlint-disable no-soft-wrap -->\nOne\ntwo\n\n<!-- markdownlint-enable no-soft-wrap -->\nThree\nfour\n", "<!-- markdownlint-disable no-soft-wrap -->\nOne\ntwo\n\n<!-- markdownlint-enable no-soft-wrap -->\nThree four\n"],
];

for (const [name, input, expected = input, options] of cases) {
  test(name, () => check(input, expected, options));
}

test("CLI loads the root rule, fails check, fixes, and then passes", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pix-markdownlint-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "fixture.md");
  const input = "# Fixture\n\nOne\ntwo.\n\n- Three\n  four.\n";
  writeFileSync(file, input);
  const cli = fileURLToPath(new URL("./markdownlint-cli2-bin.mjs", import.meta.resolve("markdownlint-cli2")));
  const config = fileURLToPath(new URL("../../.markdownlint-cli2.jsonc", import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, "--config", config, "--no-globs", file, ...args], {
    cwd: directory,
    encoding: "utf8",
  });
  const invalid = run();
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout + invalid.stderr, /no-soft-wrap/);
  assert.equal(readFileSync(file, "utf8"), input);
  const fixed = run("--fix");
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(readFileSync(file, "utf8"), "# Fixture\n\nOne two.\n\n- Three four.\n");
  const clean = run();
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
});
