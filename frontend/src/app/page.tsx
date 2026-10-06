"use client";

import { ApiGate } from "@/components/app/ApiGate";
import { ChatsPane } from "@/features/chat-list/ChatsPane";
import { ConversationView } from "@/features/conversation/ConversationView";
import { AppShell } from "@/features/shell/AppShell";
import { useRealtime } from "@/lib/realtime/useRealtime";

function Realtime() {
  useRealtime();
  return null;
}

export default function Home() {
  return (
    <ApiGate>
      <Realtime />
      <AppShell
        chatList={<ChatsPane />}
        conversation={<ConversationView />}
        settingsList={<div className="p-6 text-fg-2">Settings</div>}
        settingsDetail={null}
      />
    </ApiGate>
  );
}
