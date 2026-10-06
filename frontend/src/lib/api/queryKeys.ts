export const qk = {
  me: ["me"] as const,
  conversations: ["conversations"] as const,
  messages: (conversationId: number) => ["messages", conversationId] as const,
  contacts: ["contacts"] as const,
  blocks: ["blocks"] as const,
  search: (q: string) => ["search", q] as const,
  folders: ["folders"] as const,
  devices: ["devices"] as const,
  safety: (userId: number) => ["safety", userId] as const,
};
