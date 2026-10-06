import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { API_URL } from "@/lib/config";
import { PinnedBar } from "./PinnedBar";

const message = {
  id: 5, conversation_id: 1, sender_id: 2, client_id: null, kind: "media", body: "Summit view", created_at: "2026-10-07T10:00:00Z",
  reactions: [],
  attachments: [{ id: 1, kind: "image", mime_type: "image/jpeg", size_bytes: 1, original_name: "a.jpg", url: "/api/files/abc.jpg?exp=1&sig=x" }],
} as unknown as MessageOut;

const conversation = {
  id: 1, kind: "group", members: [], pin_permission: "all",
  me: { role: "member", left_at: null, request_state: "accepted" },
  pins: [{ message_id: 5, pinned_by: 2, pinned_at: "2026-10-07T10:01:00Z", expires_at: null, message }],
} as unknown as ConversationOut;

describe("PinnedBar", () => {
  it("loads image thumbnails from the API origin, not the web origin", () => {
    const { container } = render(<PinnedBar conversation={conversation} meId={1} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(`${API_URL}/api/files/abc.jpg?exp=1&sig=x`);
  });
});
