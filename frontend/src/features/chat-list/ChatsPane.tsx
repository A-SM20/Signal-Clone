"use client";

import { Archive, ArchiveRestore, ArrowLeft, Bell, BellOff, Ellipsis, MessageSquareDashed, Pin, PinOff, SquarePen, WifiOff } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { IconButton, SearchInput } from "@/components/ui/controls";
import { patchMyState, useConversations, useMeId } from "@/lib/api/hooks";
import { inFolder, useFolders } from "@/lib/folders";
import type { ConversationOut } from "@/lib/api/types";
import { isMuted } from "@/lib/conversations";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { useAuth } from "@/stores/auth";
import { useSocket } from "@/stores/socket";
import { useUi } from "@/stores/ui";
import { NewChatPanel } from "../contacts/NewChatPanel";
import { CreateGroupFlow } from "../groups/CreateGroupFlow";
import { ConversationRow } from "./ConversationRow";
import { SearchResults } from "./SearchResults";
import { FolderTabs } from "./FolderTabs";

export function ConnectingBanner() {
  const status = useSocket((s) => s.status);
  if (status === "open") return null;
  return (
    <div role="status" className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-fg-2">
      <WifiOff size={14} />
      Connecting…
    </div>
  );
}

/** Left pane on the Chats tab (desktop) / the whole Chats screen (mobile). */
export function ChatsPane({ extra }: { extra?: React.ReactNode } = {}) {
  const { panel, openPanel, closePanel, selectedId, select, setTab, folder, setFolder } = useUi();
  const { data: folders = [] } = useFolders();
  const meId = useMeId();
  const me = useAuth((s) => s.me);
  const breakpoint = useBreakpoint();
  const { data: conversations, isLoading } = useConversations();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener("signal:focus-search", focus);
    return () => window.removeEventListener("signal:focus-search", focus);
  }, []);

  const onSelect = useCallback((id: number) => select(id), [select]);
  const onContextMenu = useCallback((e: MouseEvent, c: ConversationOut) => {
    e.preventDefault();
    const muted = isMuted(c);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: c.me.is_pinned ? "Unpin chat" : "Pin chat",
          icon: c.me.is_pinned ? <PinOff size={16} /> : <Pin size={16} />,
          onSelect: () => patchMyState(c.id, { is_pinned: !c.me.is_pinned }),
        },
        {
          label: muted ? "Unmute" : "Mute notifications",
          icon: muted ? <Bell size={16} /> : <BellOff size={16} />,
          onSelect: () =>
            patchMyState(c.id, { muted_until: muted ? null : new Date(Date.now() + 8 * 3600_000).toISOString() }),
        },
        {
          label: c.me.is_archived ? "Unarchive" : "Archive",
          icon: c.me.is_archived ? <ArchiveRestore size={16} /> : <Archive size={16} />,
          onSelect: () => patchMyState(c.id, { is_archived: !c.me.is_archived }),
        },
      ],
    });
  }, []);

  if (panel === "new-chat") return <NewChatPanel />;
  if (panel === "new-group") return <CreateGroupFlow />;

  const showArchived = panel === "archived";
  const showRequests = panel === "requests";
  const all = conversations ?? [];
  const requests = all.filter((c) => c.me.request_state === "pending");
  const activeFolder = folder === "all" ? "all" : (folders.find((f) => f.id === folder) ?? "all");
  const inList = showArchived || showRequests;
  const visible = showRequests
    ? requests
    : all.filter(
        (c) =>
          c.me.is_archived === showArchived &&
          c.me.request_state !== "pending" &&
          (showArchived || inFolder(c, activeFolder)),
      );
  const archivedCount = (conversations ?? []).filter((c) => c.me.is_archived).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-1 px-4">
        {showArchived || showRequests ? (
          <>
            <IconButton label="Back" onClick={closePanel} className="-ml-2">
              <ArrowLeft size={20} />
            </IconButton>
            <h1 className="flex-1 text-[17px] font-semibold">{showRequests ? "Message requests" : "Archived chats"}</h1>
          </>
        ) : (
          <>
            {breakpoint === "mobile" && me && (
              <button aria-label="Settings" onClick={() => setTab("settings")} className="mr-3 rounded-full">
                <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size="sm" />
              </button>
            )}
            <h1 className="flex-1 text-[20px] font-bold">{breakpoint === "mobile" ? "Signal" : "Chats"}</h1>
            <IconButton label="New chat" onClick={() => openPanel("new-chat")}>
              <SquarePen size={19} />
            </IconButton>
            <IconButton
              label="More"
              onClick={(e) =>
                setMenu({
                  x: e.currentTarget.getBoundingClientRect().left,
                  y: e.currentTarget.getBoundingClientRect().bottom + 4,
                  items: [
                    { label: "New group", onSelect: () => openPanel("new-group") },
                    { label: "Archived chats", onSelect: () => openPanel("archived") },
                    { label: "Settings", onSelect: () => setTab("settings") },
                  ],
                })
              }
            >
              <Ellipsis size={20} />
            </IconButton>
          </>
        )}
      </div>
      {!showArchived && !showRequests && (
        <div className="shrink-0 px-4 pb-3">
          <SearchInput ref={searchRef} value={query} onChange={setQuery} />
        </div>
      )}
      {!inList && !query.trim() && <FolderTabs folders={folders} value={activeFolder === "all" ? "all" : activeFolder.id} onChange={setFolder} />}
      <ConnectingBanner />
      {query.trim().length >= 2 ? (
        <SearchResults query={query.trim()} onDone={() => setQuery("")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {!showArchived && !showRequests && extra}
          {!showArchived && !showRequests && activeFolder === "all" && requests.length > 0 && (
            <button
              onClick={() => openPanel("requests")}
              className="mx-2 mb-1 flex w-[calc(100%-16px)] items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-hover"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-2">
                <MessageSquareDashed size={22} />
              </span>
              <span className="flex-1 text-[14px] font-semibold">Message requests</span>
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                {requests.length}
              </span>
            </button>
          )}
          {isLoading && <p className="px-4 pt-6 text-center text-[13px] text-fg-2">Loading chats…</p>}
          <ul>
            {visible.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                meId={meId}
                selected={c.id === selectedId}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
              />
            ))}
          </ul>
          {!showArchived && !showRequests && activeFolder === "all" && archivedCount > 0 && (
            <button
              onClick={() => openPanel("archived")}
              className="mx-2 mt-1 flex w-[calc(100%-16px)] items-center gap-3 rounded-xl px-2.5 py-3 text-left text-[14px] font-medium text-fg-2 hover:bg-hover"
            >
              <span className="flex h-12 w-12 items-center justify-center">
                <Archive size={20} />
              </span>
              Archived chats ({archivedCount})
            </button>
          )}
          {conversations && !visible.length && (
            <p className="px-6 pt-10 text-center text-[13px] text-fg-2">
              {showRequests
                ? "No message requests"
                : showArchived
                  ? "No archived chats"
                  : activeFolder !== "all"
                    ? "No chats in this folder"
                    : "No chats yet. Tap the pencil to start one."}
            </p>
          )}
        </div>
      )}
      {breakpoint === "mobile" && !showArchived && !showRequests && (
        <button
          aria-label="New chat"
          onClick={() => openPanel("new-chat")}
          className="absolute right-5 bottom-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg"
        >
          <SquarePen size={22} />
        </button>
      )}
      {menu && <ContextMenu items={menu.items} anchor={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)} />}
    </div>
  );
}
