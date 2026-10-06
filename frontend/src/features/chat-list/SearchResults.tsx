"use client";

import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/Avatar";
import { apiFetch } from "@/lib/api/client";
import { openDirect, useConversations, useMeId } from "@/lib/api/hooks";
import { qk } from "@/lib/api/queryKeys";
import type { SearchOut } from "@/lib/api/types";
import { formatListTime } from "@/lib/time";
import { useUi } from "@/stores/ui";

function Heading({ children }: { children: string }) {
  return <h3 className="px-4 pt-3 pb-1 text-[13px] font-semibold text-fg-2">{children}</h3>;
}

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-transparent font-semibold text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Signal-style grouped results: Chats, Contacts, Messages. */
export function SearchResults({ query, onDone }: { query: string; onDone: () => void }) {
  const select = useUi((s) => s.select);
  const meId = useMeId();
  const { data: conversations } = useConversations();
  const { data, isFetching } = useQuery({
    queryKey: qk.search(query),
    queryFn: () => apiFetch<SearchOut>(`/api/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 10_000,
  });

  if (query.length < 2) return null;
  const open = (id: number) => {
    select(id);
    onDone();
  };
  const titleOf = (conversationId: number) => conversations?.find((c) => c.id === conversationId);
  const empty = data && !data.chats.length && !data.contacts.length && !data.messages.length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      {empty && !isFetching && <p className="px-4 pt-8 text-center text-[13px] text-fg-2">No results for “{query}”</p>}
      {!!data?.chats.length && <Heading>Chats</Heading>}
      {data?.chats.map((c) => (
        <button key={c.id} onClick={() => open(c.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
          <Avatar name={c.title} color={c.avatar_color} url={c.avatar_url} size="md" />
          <span className="truncate text-[14px] font-medium">{highlight(c.title, query)}</span>
        </button>
      ))}
      {!!data?.contacts.length && <Heading>Contacts</Heading>}
      {data?.contacts.map((u) => (
        <button
          key={u.id}
          onClick={async () => open((await openDirect(u.id)).id)}
          className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover"
        >
          <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium">{highlight(u.display_name, query)}</span>
            {u.username && <span className="block truncate text-[12px] text-fg-2">{u.username}</span>}
          </span>
        </button>
      ))}
      {!!data?.messages.length && <Heading>Messages</Heading>}
      {data?.messages.map((m) => {
        const c = titleOf(m.conversation_id);
        const sender = m.sender_id === meId ? "You" : c?.members.find((x) => x.user.id === m.sender_id)?.user.display_name;
        return (
          <button key={m.id} onClick={() => open(m.conversation_id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
            {c && <Avatar name={c.title} color={c.avatar_color} url={c.avatar_url} size="md" />}
            <span className="min-w-0 flex-1">
              <span className="flex justify-between gap-2">
                <span className="truncate text-[14px] font-medium">{c?.title}</span>
                <span className="shrink-0 text-[12px] text-fg-2">{formatListTime(m.created_at)}</span>
              </span>
              <span className="line-clamp-2 text-[13px] text-fg-2">
                {sender && c?.kind === "group" ? `${sender}: ` : ""}
                {highlight(m.body ?? "", query)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
