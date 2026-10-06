"""Builders for every server -> client WebSocket event (envelope: {type, data, ts})."""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel


def _dump(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [_dump(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def envelope(type_: str, data: dict) -> dict:
    return {
        "type": type_,
        "data": {k: _dump(v) for k, v in data.items()},
        "ts": datetime.now(timezone.utc).isoformat(),
    }


def ready(user_id: int, device_id: int) -> dict:
    return envelope("ready", {"user_id": user_id, "device_id": device_id})


def pong() -> dict:
    return envelope("pong", {})


def message_created(message: BaseModel) -> dict:
    return {**envelope("message.created", {}), "data": _dump(message)}


def message_updated(message: BaseModel) -> dict:
    return {**envelope("message.updated", {}), "data": _dump(message)}


def message_removed(conversation_id: int, message_ids: list[int]) -> dict:
    return envelope("message.removed", {"conversation_id": conversation_id, "message_ids": message_ids})


def reaction_updated(conversation_id: int, message_id: int, reactions: list) -> dict:
    return envelope(
        "reaction.updated",
        {"conversation_id": conversation_id, "message_id": message_id, "reactions": reactions},
    )


def poll_updated(conversation_id: int, message_id: int, options: list, ended_at: datetime | None) -> dict:
    return envelope(
        "poll.updated",
        {"conversation_id": conversation_id, "message_id": message_id, "options": options, "ended_at": ended_at},
    )


def pin_updated(conversation_id: int, pins: list) -> dict:
    return envelope("pin.updated", {"conversation_id": conversation_id, "pins": pins})


def receipt_updated(conversation_id: int, user_id: int, delivered_up_to: int | None, read_up_to: int | None) -> dict:
    return envelope(
        "receipt.updated",
        {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "delivered_up_to": delivered_up_to,
            "read_up_to": read_up_to,
        },
    )


def typing(conversation_id: int, user_id: int, state: str) -> dict:
    return envelope("typing", {"conversation_id": conversation_id, "user_id": user_id, "state": state})


def presence(user_id: int, online: bool, last_seen_at: datetime | None) -> dict:
    return envelope("presence", {"user_id": user_id, "online": online, "last_seen_at": last_seen_at})


def conversation_updated(conversation: BaseModel) -> dict:
    return {**envelope("conversation.updated", {}), "data": _dump(conversation)}


def conversation_removed(conversation_id: int) -> dict:
    return envelope("conversation.removed", {"conversation_id": conversation_id})


def device_revoked() -> dict:
    return envelope("device.revoked", {})
