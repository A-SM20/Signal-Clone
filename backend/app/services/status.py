from collections.abc import Sequence
from typing import Literal, NamedTuple

Status = Literal["sent", "delivered", "read"]


class MemberCursor(NamedTuple):
    user_id: int
    delivered: int | None  # None = hidden from the viewer, treated as 0
    read: int | None
    active: bool


def derive_status(message_id: int, sender_id: int, members: Sequence[MemberCursor]) -> Status:
    """Tick state for the sender: read only when every active recipient has read it, delivered likewise.

    Message ids only grow, so a member's cursor >= message_id means they have it.
    Note to Self (no other members) counts as read.
    """
    recipients = [m for m in members if m.active and m.user_id != sender_id]
    if all((m.read or 0) >= message_id for m in recipients):
        return "read"
    if all((m.delivered or 0) >= message_id for m in recipients):
        return "delivered"
    return "sent"
