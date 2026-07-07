import { type BundledLanguage, getSingletonHighlighter } from "shiki";

export const SHIKI_THEME = "github-dark";

export async function highlightCode(code: string, lang: BundledLanguage) {
  const highlighter = await getSingletonHighlighter({
    themes: [SHIKI_THEME],
    langs: [lang],
  });
  return highlighter.codeToHtml(code, { lang, theme: SHIKI_THEME });
}
