export type BilingualLang = "ro" | "en";

const RO_DIACRITICS = /[ăâîșțĂÂÎȘȚ]/;
const RO_WORD =
  /\b(și|si|este|sunt|nu|da|că|ca|pentru|sau|dar|acest|aceast|mulțumesc|multumesc|bună|buna|salut|vreau|suntem|fac|face|aici|acolo|ce|cum|unde|când|cand|de|la|cu|din|pe|un|o|eu|tu|el|ea|noi|voi|ei|ele|foarte|bine|zi|spune|vorbesc|traduce)\b/gi;
const EN_WORD =
  /\b(the|is|are|was|were|and|or|but|this|that|what|how|where|when|you|your|hello|thanks|thank|please|want|need|have|has|can|will|would|could|should|not|don't|doesn't|it's|i'm|you're|speak|translate|good|morning|night|yes|no)\b/gi;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

/** Detectează română vs engleză pentru perechea RO ↔ EN. */
export function detectLang(text: string): BilingualLang {
  const t = text.trim();
  if (!t) return "ro";

  if (RO_DIACRITICS.test(t)) return "ro";

  const roScore = countMatches(t, RO_WORD);
  const enScore = countMatches(t, EN_WORD);

  if (enScore > roScore) return "en";
  if (roScore > enScore) return "ro";

  // Fără diacritice și fără cuvinte clare: preferă engleza dacă e doar ASCII latin
  if (/^[a-z0-9\s.,!?'"-]+$/i.test(t)) return "en";

  return "ro";
}

export function oppositeLang(lang: BilingualLang): BilingualLang {
  return lang === "ro" ? "en" : "ro";
}
