from sqlalchemy import func, select

from app.models import Conversation, Message, User
from app.seed.build import seed_database
from tests.helpers import db_call, login


def _counts(client):
    async def run(s):
        users = await s.scalar(select(func.count(User.id)))
        groups = await s.scalar(select(func.count(Conversation.id)).where(Conversation.kind == "group"))
        directs = await s.scalar(select(func.count(Conversation.id)).where(Conversation.kind == "direct"))
        messages = await s.scalar(select(func.count(Message.id)))
        return users, groups, directs, messages

    return db_call(client, run)


def test_seed_creates_demo_world(seeded_client):
    users, groups, directs, messages = _counts(seeded_client)
    assert users == 8 and groups == 3 and directs >= 6 and messages >= 180


def test_seed_is_idempotent(seeded_client):
    before = _counts(seeded_client)
    state = seeded_client.app.state
    seeded_client.portal.call(seed_database, state.session_factory, state.settings, state.clock)
    assert _counts(seeded_client) == before


def test_demo_login_works(seeded_client):
    r = seeded_client.post(
        "/api/auth/verify-otp", json={"phone": "+15550100001", "code": "123456", "device_name": "pytest"}
    ).json()
    assert r["is_new_user"] is False and r["user"]["display_name"] == "Alice Chen"
    assert r["user"]["username"] == "alice.01"


def test_alice_has_unread(seeded_client):
    a = login(seeded_client, "+15550100001")
    convs = seeded_client.get("/api/conversations", headers=a.headers).json()
    assert len([c for c in convs if c["unread_count"] > 0]) >= 2
    assert any(c["is_note_to_self"] for c in convs)
    assert {"Weekend Hike", "Family", "Project Phoenix"} <= {c["title"] for c in convs}


def test_alice_sent_statuses_are_mixed(seeded_client):
    """Alice's latest outgoing messages should show a mix of sent/delivered/read ticks."""
    a = login(seeded_client, "+15550100001")
    convs = seeded_client.get("/api/conversations", headers=a.headers).json()
    states = set()
    for c in convs:
        last = c["last_message"]
        if c["kind"] != "direct" or c["is_note_to_self"] or last["sender_id"] != a.user_id:
            continue
        other = next(m for m in c["members"] if m["user"]["id"] != a.user_id)
        if (other["last_read_message_id"] or 0) >= last["id"]:
            states.add("read")
        elif (other["last_delivered_message_id"] or 0) >= last["id"]:
            states.add("delivered")
        else:
            states.add("sent")
    assert {"sent", "delivered"} <= states


def test_no_future_timestamps(seeded_client, clock):
    async def latest(s):
        return await s.scalar(select(func.max(Message.created_at)))

    assert db_call(seeded_client, latest) <= clock.now()


def test_seed_includes_album_and_file(seeded_client):
    a = login(seeded_client, "+15550100001")
    convs = {c["title"]: c["id"] for c in seeded_client.get("/api/conversations", headers=a.headers).json()}

    def media(title):
        items = seeded_client.get(f"/api/conversations/{convs[title]}/messages?limit=100", headers=a.headers).json()["items"]
        return [m for m in items if m["kind"] == "media"]

    album = media("Weekend Hike")[0]
    assert len(album["attachments"]) == 3 and album["attachments"][0]["width"] == 960
    assert seeded_client.get(album["attachments"][0]["url"]).status_code == 200
    assert media("Project Phoenix")[0]["attachments"][0]["kind"] == "file"


def test_seed_has_reactions_and_replies(seeded_client):
    a = login(seeded_client, "+15550100001")
    convs = {c["title"]: c["id"] for c in seeded_client.get("/api/conversations", headers=a.headers).json()}
    items = seeded_client.get(f"/api/conversations/{convs['Weekend Hike']}/messages?limit=100", headers=a.headers).json()["items"]
    assert any(len(m["reactions"]) >= 2 for m in items)
    replies = [m for m in items if m["reply_to"]]
    assert replies and replies[0]["reply_to"]["body"]


def test_seed_has_disappearing_chat(seeded_client):
    a = login(seeded_client, "+15550100001")
    emma = next(c for c in seeded_client.get("/api/conversations", headers=a.headers).json() if c["title"] == "Emma Wilson")
    assert emma["disappearing_seconds"] == 604800
    items = seeded_client.get(f"/api/conversations/{emma['id']}/messages?limit=100", headers=a.headers).json()["items"]
    assert any(m["system_event"] and m["system_event"]["type"] == "timer_changed" for m in items)
    assert items[0]["expires_at"] is not None


def test_seed_has_message_request(seeded_client):
    a = login(seeded_client, "+15550100001")
    jordan = next(c for c in seeded_client.get("/api/conversations", headers=a.headers).json() if c["title"] == "Jordan Blake")
    assert jordan["me"]["request_state"] == "pending" and jordan["unread_count"] == 2


def test_seed_verifications(seeded_client):
    a = login(seeded_client, "+15550100001")
    people = {c["title"]: c for c in seeded_client.get("/api/conversations", headers=a.headers).json()}
    bob = next(m for m in people["Bob Martinez"]["members"] if m["user"]["id"] != a.user_id)["user"]["id"]
    daniel = next(m for m in people["Daniel Kim"]["members"] if m["user"]["id"] != a.user_id)["user"]["id"]
    sn_bob = seeded_client.get(f"/api/users/{bob}/safety-number", headers=a.headers).json()
    sn_daniel = seeded_client.get(f"/api/users/{daniel}/safety-number", headers=a.headers).json()
    assert sn_bob["verified"] is True and sn_bob["changed"] is False
    assert sn_daniel["verified"] is False and sn_daniel["changed"] is True
    assert people["Daniel Kim"]["safety_number_changed"] is True
    assert people["Bob Martinez"]["safety_number_changed"] is False


def test_seed_edits(seeded_client):
    a = login(seeded_client, "+15550100001")
    conv = next(c for c in seeded_client.get("/api/conversations", headers=a.headers).json() if c["title"] == "Bob Martinez")
    items = seeded_client.get(f"/api/conversations/{conv['id']}/messages?limit=100", headers=a.headers).json()["items"]
    edited = [m for m in items if m["edited_at"]]
    deleted = [m for m in items if m["deleted_at"]]
    assert len(edited) == 1 and len(deleted) == 1 and deleted[0]["body"] is None
    revs = seeded_client.get(f"/api/messages/{edited[0]['id']}/revisions", headers=a.headers).json()
    assert len(revs) == 1 and revs[0]["body"] != edited[0]["body"]


def test_seed_pin_in_phoenix(seeded_client):
    a = login(seeded_client, "+15550100001")
    phoenix = next(c for c in seeded_client.get("/api/conversations", headers=a.headers).json() if c["title"] == "Project Phoenix")
    assert len(phoenix["pins"]) == 1 and phoenix["pins"][0]["message"]["body"]


def test_seed_poll_in_hike(seeded_client):
    a = login(seeded_client, "+15550100001")
    hike = next(c for c in seeded_client.get("/api/conversations", headers=a.headers).json() if c["title"] == "Weekend Hike")
    items = seeded_client.get(f"/api/conversations/{hike['id']}/messages", headers=a.headers).json()["items"]
    poll = next(m for m in items if m["kind"] == "poll")["poll"]
    assert poll["question"] == "Saturday trail?" and sum(o["vote_count"] for o in poll["options"]) >= 2
