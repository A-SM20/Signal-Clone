import { describe, expect, it } from "vitest";
import { useAuth } from "./auth";
import { useReply } from "./reply";
import { useUi } from "./ui";

describe("ui store on sign-out", () => {
  it("returns the next account to the chat list, not the previous account's screen", () => {
    useUi.getState().setTab("settings");
    useUi.getState().openSettings("profile");
    useUi.getState().select(7);
    useUi.getState().openPanel("conversation-settings");

    useAuth.getState().signOut();

    const s = useUi.getState();
    expect(s.tab).toBe("chats");
    expect(s.settingsSection).toBeNull();
    expect(s.selectedId).toBeNull();
    expect(s.panel).toBeNull();
  });

  it("drops pending reply drafts", () => {
    useReply.getState().set(7, { id: 1 } as never);
    useAuth.getState().signOut();
    expect(useReply.getState().byConversation).toEqual({});
  });
});
