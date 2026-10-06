import pytest
from sqlalchemy import delete, inspect, select
from sqlalchemy.exc import IntegrityError

from app.models import Contact, Conversation, ConversationMember, Message, User
from tests.helpers import db_call


def _user(phone: str, name: str) -> User:
    return User(phone=phone, display_name=name, avatar_color="#000000", identity_key="a" * 44)


async def _two_users(s):
    a, b = _user("+15550100001", "Alice"), _user("+15550100002", "Bob")
    s.add_all([a, b])
    await s.flush()
    return a, b


def test_core_tables_created(client):
    async def names(s):
        conn = await s.connection()
        return set(await conn.run_sync(lambda c: inspect(c).get_table_names()))

    assert {
        "users", "user_settings", "devices", "contacts", "blocks",
        "conversations", "conversation_members", "messages",
    } <= db_call(client, names)


def test_direct_key_unique(client):
    async def run(s):
        s.add(Conversation(kind="direct", direct_key="1:2"))
        await s.flush()
        s.add(Conversation(kind="direct", direct_key="1:2"))
        await s.flush()

    with pytest.raises(IntegrityError):
        db_call(client, run)


def test_client_id_unique_per_sender(client):
    async def setup(s):
        a, b = await _two_users(s)
        c = Conversation(kind="direct", direct_key=f"{a.id}:{b.id}")
        s.add(c)
        await s.flush()
        s.add(Message(conversation_id=c.id, sender_id=a.id, client_id="x", kind="text", body="hi"))
        s.add(Message(conversation_id=c.id, sender_id=b.id, client_id="x", kind="text", body="hi"))
        await s.flush()
        return a.id, c.id

    a_id, c_id = db_call(client, setup)

    async def dup(s):
        s.add(Message(conversation_id=c_id, sender_id=a_id, client_id="x", kind="text", body="again"))
        await s.flush()

    with pytest.raises(IntegrityError):
        db_call(client, dup)


def test_contact_cannot_reference_self(client):
    async def run(s):
        a, _ = await _two_users(s)
        s.add(Contact(owner_id=a.id, contact_id=a.id))
        await s.flush()

    with pytest.raises(IntegrityError):
        db_call(client, run)


def test_member_cascade_on_conversation_delete(client):
    async def run(s):
        a, b = await _two_users(s)
        c = Conversation(kind="group", title="G")
        s.add(c)
        await s.flush()
        s.add_all([
            ConversationMember(conversation_id=c.id, user_id=a.id, role="admin"),
            ConversationMember(conversation_id=c.id, user_id=b.id),
        ])
        await s.flush()
        await s.execute(delete(Conversation).where(Conversation.id == c.id))
        return (await s.execute(select(ConversationMember))).scalars().all()

    assert db_call(client, run) == []
