import { Info, Timer, Users } from "lucide-react";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { memberName, type SystemEvent, systemText } from "@/lib/conversations";

export function SystemMessage({ message, conversation, meId }: { message: MessageOut; conversation: ConversationOut; meId: number }) {
  const event = (message.system_event ?? { type: "unknown" }) as SystemEvent;
  const Icon = event.type === "timer_changed" ? Timer : event.type.startsWith("member") || event.type === "group_created" ? Users : Info;
  return (
    <div className="flex justify-center px-6 py-2">
      <p className="flex max-w-md items-start gap-1.5 text-center text-[12px] leading-4 text-fg-2">
        <Icon size={13} className="mt-[1px] shrink-0" aria-hidden />
        <span>{systemText(event, (id) => memberName(conversation, id), meId)}</span>
      </p>
    </div>
  );
}
