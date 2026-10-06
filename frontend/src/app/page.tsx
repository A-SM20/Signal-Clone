"use client";

import { ApiGate } from "@/components/app/ApiGate";
import { ChatsPane } from "@/features/chat-list/ChatsPane";
import { AppShell } from "@/features/shell/AppShell";

export default function Home() {
  return (
    <ApiGate>
      <AppShell
        chatList={<ChatsPane />}
        conversation={<div className="p-6 text-fg-2">Conversation</div>}
        settingsList={<div className="p-6 text-fg-2">Settings</div>}
        settingsDetail={null}
      />
    </ApiGate>
  );
}
