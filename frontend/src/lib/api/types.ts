import type { components } from "./schema";

type S = components["schemas"];

export type UserOut = S["UserOut"];
export type MeOut = S["MeOut"];
export type SettingsOut = S["SettingsOut"];
export type AuthOut = S["AuthOut"];
export type MemberOut = S["MemberOut"];
export type MyStateOut = S["MyStateOut"];
export type ConversationOut = S["ConversationOut"];
export type MessageOut = S["MessageOut"];
export type MessagePage = S["MessagePage"];
export type ReplyPreviewOut = S["ReplyPreviewOut"];
export type AttachmentOut = S["AttachmentOut"];
export type ReactionOut = S["ReactionOut"];
export type PollOut = S["PollOut"];
export type DeviceOut = S["DeviceOut"];
export type SearchOut = S["SearchOut"];
export type SendMessageIn = S["SendMessageIn"];
