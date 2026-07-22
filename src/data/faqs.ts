/**
 * FAQ structure keys — content lives in marketing.json (`faq.groups`).
 * Kept for any callers that still import this module; prefer useTranslation('marketing').
 */
export const faqs = [] as Array<{
  category: string;
  items: Array<{ q: string; a: string }>;
}>;
