from tests.helpers import assert_no_event, login, ws_session


def _group(client, owner, members, title="Weekend Hike"):
    r = client.post(
        "/api/conversations/groups",
        json={"title": title, "member_ids": [m.user_id for m in members]},
        headers=owner.headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _until(ws, type_, limit=5):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == type_:
            return frame
    raise AssertionError(f"no {type_} frame")


def test_direct_get_or_create_is_symmetric(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    r1 = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers)
    r2 = client.post("/api/conversations/direct", json={"user_id": a.user_id}, headers=b.headers)
    assert r1.status_code == 201 and r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    assert r1.json()["title"] == "Bob" and r2.json()["title"] == "Alice"
    assert r1.json()["kind"] == "direct" and len(r1.json()["members"]) == 2


def test_direct_with_unknown_user_404(client):
    a = login(client, "+15550100001", "Alice")
    r = client.post("/api/conversations/direct", json={"user_id": 999}, headers=a.headers)
    assert r.status_code == 404


def test_note_to_self(client):
    a = login(client, "+15550100001", "Alice")
    c = client.post("/api/conversations/direct", json={"user_id": a.user_id}, headers=a.headers).json()
    assert c["is_note_to_self"] is True and c["title"] == "Note to Self" and len(c["members"]) == 1


def test_group_create_creator_admin_and_system_messages(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    g = _group(client, a, [b])
    roles = {m["user"]["id"]: m["role"] for m in g["members"]}
    assert roles == {a.user_id: "admin", b.user_id: "member"}
    assert g["me"]["role"] == "admin" and g["title"] == "Weekend Hike"
    assert g["last_message"]["kind"] == "system"
    assert g["last_message"]["system_event"]["type"] in {"group_created", "member_added"}


def test_group_title_required(client):
    a = login(client, "+15550100001", "Alice")
    r = client.post("/api/conversations/groups", json={"title": "  ", "member_ids": []}, headers=a.headers)
    assert r.status_code == 422


def test_non_member_gets_404(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    g = _group(client, a, [b])
    r = client.get(f"/api/conversations/{g['id']}", headers=c.headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_non_admin_cannot_add_403(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    g = _group(client, a, [b])
    r = client.post(f"/api/conversations/{g['id']}/members", json={"user_ids": [c.user_id]}, headers=b.headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_admin"


def test_admin_add_remove_and_promote(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    g = _group(client, a, [b])
    added = client.post(f"/api/conversations/{g['id']}/members", json={"user_ids": [c.user_id]}, headers=a.headers)
    assert added.status_code == 200 and c.user_id in {m["user"]["id"] for m in added.json()["members"]}
    promoted = client.patch(f"/api/conversations/{g['id']}/members/{b.user_id}", json={"role": "admin"}, headers=a.headers)
    assert {m["user"]["id"]: m["role"] for m in promoted.json()["members"]}[b.user_id] == "admin"
    removed = client.delete(f"/api/conversations/{g['id']}/members/{c.user_id}", headers=b.headers)
    assert removed.status_code == 200
    carol_view = client.get(f"/api/conversations/{g['id']}", headers=c.headers)
    assert carol_view.status_code == 200 and carol_view.json()["me"]["left_at"] is not None


def test_admin_cannot_remove_self_via_member_route_is_leave(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    g = _group(client, a, [b])
    r = client.delete(f"/api/conversations/{g['id']}/members/{b.user_id}", headers=b.headers)
    assert r.status_code == 200 and r.json()["me"]["left_at"] is not None


def test_last_admin_leaving_promotes_oldest_member(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    g = _group(client, a, [b])
    clock.advance(minutes=1)
    client.post(f"/api/conversations/{g['id']}/members", json={"user_ids": [c.user_id]}, headers=a.headers)
    client.delete(f"/api/conversations/{g['id']}/members/{a.user_id}", headers=a.headers)
    roles = {
        m["user"]["id"]: m["role"]
        for m in client.get(f"/api/conversations/{g['id']}", headers=b.headers).json()["members"]
        if m["left_at"] is None
    }
    assert roles == {b.user_id: "admin", c.user_id: "member"}


def test_list_sorted_pinned_then_recent(client, clock):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    first = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()
    clock.advance(minutes=1)
    second = client.post("/api/conversations/direct", json={"user_id": c.user_id}, headers=a.headers).json()
    ids = [c["id"] for c in client.get("/api/conversations", headers=a.headers).json()]
    assert ids == [second["id"], first["id"]]
    pin = client.patch(f"/api/conversations/{first['id']}/me", json={"is_pinned": True}, headers=a.headers)
    assert pin.status_code == 200 and pin.json()["me"]["is_pinned"] is True
    ids = [c["id"] for c in client.get("/api/conversations", headers=a.headers).json()]
    assert ids == [first["id"], second["id"]]


def test_my_state_mute_and_archive(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    conv = client.post("/api/conversations/direct", json={"user_id": b.user_id}, headers=a.headers).json()
    r = client.patch(
        f"/api/conversations/{conv['id']}/me",
        json={"is_archived": True, "muted_until": "2026-10-07T12:00:00Z"},
        headers=a.headers,
    )
    assert r.json()["me"]["is_archived"] is True and r.json()["me"]["muted_until"].startswith("2026-10-07")
    bob_view = client.get(f"/api/conversations/{conv['id']}", headers=b.headers).json()
    assert bob_view["me"]["is_archived"] is False


def test_rename_admin_only(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    g = _group(client, a, [b])
    assert client.patch(f"/api/conversations/{g['id']}", json={"title": "X"}, headers=b.headers).status_code == 403
    r = client.patch(f"/api/conversations/{g['id']}", json={"title": "Trail Crew"}, headers=a.headers)
    assert r.status_code == 200 and r.json()["title"] == "Trail Crew"


def test_mutation_publishes_conversation_updated(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    g = _group(client, a, [b])
    with ws_session(client, b.token) as bob_ws:
        client.patch(f"/api/conversations/{g['id']}", json={"title": "Trail Crew"}, headers=a.headers)
        frame = _until(bob_ws, "conversation.updated")
        assert frame["data"]["title"] == "Trail Crew" and frame["data"]["me"]["role"] == "member"


def test_new_group_member_is_notified(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    with ws_session(client, b.token) as bob_ws:
        g = _group(client, a, [b])
        frame = _until(bob_ws, "conversation.updated")
        assert frame["data"]["id"] == g["id"]


def test_removed_member_stops_receiving_events(client):
    a = login(client, "+15550100001", "Alice")
    b = login(client, "+15550100002", "Bob")
    c = login(client, "+15550100003", "Carol")
    g = _group(client, a, [b, c])
    client.delete(f"/api/conversations/{g['id']}/members/{c.user_id}", headers=a.headers)
    with ws_session(client, c.token) as carol_ws:
        client.patch(f"/api/conversations/{g['id']}", json={"title": "Secret"}, headers=a.headers)
        assert_no_event(carol_ws)
