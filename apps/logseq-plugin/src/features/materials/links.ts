export const docIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export function idFrom(text: string): string | null {
  const id = /longdoc:\/\/([0-9a-f-]{36})/i.exec(text)?.[1]; return id && docIdPattern.test(id) ? id : null;
}
// Preserve DOMPurify's normal URI policy, adding only a complete stable material URL.
export const safeMarkdownURI = new RegExp(`^(?:longdoc://(?:${docIdPattern.source.slice(1, -1)})$|(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))`, "i");
