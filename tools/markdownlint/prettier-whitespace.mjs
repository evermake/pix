// Adapted from Prettier's Markdown whitespace printer (MIT).
// https://github.com/prettier/prettier/blob/41b6c9bff22e77be7f88d0f127ab573d67000f48/src/language-markdown/print/whitespace.js

// Prettier receives classified word nodes from its AST. Our adapter classifies
// the adjacent Unicode characters instead, conservatively retaining ambiguous
// CJK breaks rather than importing Prettier's printer and Unicode build tools.
const cjk = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}\u3000-\u303f\uff00-\uffef]/u;
const korean = /\p{Script_Extensions=Hangul}/u;
const punctuation = /[\p{P}\u3000\uff5e]/u;
const variationSelector = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u;

function word(character) {
  if (!character || !cjk.test(character)) {
    return { kind: "non-cjk", isCJ: false };
  }
  if (punctuation.test(character)) {
    return { kind: "cjk-punctuation", isCJ: true };
  }
  if (korean.test(character)) {
    return { kind: "k-letter", isCJ: false };
  }
  return { kind: "cj-letter", isCJ: true };
}

// Adaptation of isLineBreakAmbiguous. With proseWrap: "never", Prettier's
// printWhitespace preserves these breaks and replaces other prose breaks with
// a space. CJ/Korean letter pairs are its explicit exception.
export function isLineBreakAmbiguous(before, after) {
  const previous = word([...before].filter((c) => !variationSelector.test(c)).at(-1));
  const next = word([...after][0]);
  return Boolean(
    (previous.isCJ || next.isCJ) &&
      !(
        (previous.kind === "k-letter" && next.kind === "cj-letter") ||
        (next.kind === "k-letter" && previous.kind === "cj-letter")
      ),
  );
}
