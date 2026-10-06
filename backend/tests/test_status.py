from app.services.status import MemberCursor, derive_status

ALICE, BOB, CAROL = 1, 2, 3


def test_direct_statuses():
    def status(delivered, read):
        return derive_status(10, ALICE, [MemberCursor(ALICE, 10, 10, True), MemberCursor(BOB, delivered, read, True)])

    assert status(9, 0) == "sent"
    assert status(10, 0) == "delivered"
    assert status(10, 10) == "read"
    assert status(12, 11) == "read"


def test_group_needs_everyone():
    members = [
        MemberCursor(ALICE, 10, 10, True),
        MemberCursor(BOB, 10, 10, True),
        MemberCursor(CAROL, 10, 5, True),
    ]
    assert derive_status(10, ALICE, members) == "delivered"


def test_inactive_members_ignored():
    members = [MemberCursor(ALICE, 10, 10, True), MemberCursor(BOB, 10, 10, True), MemberCursor(CAROL, 0, 0, False)]
    assert derive_status(10, ALICE, members) == "read"


def test_hidden_cursor_counts_as_zero():
    members = [MemberCursor(ALICE, 10, 10, True), MemberCursor(BOB, 10, None, True)]
    assert derive_status(10, ALICE, members) == "delivered"


def test_note_to_self_is_read():
    assert derive_status(10, ALICE, [MemberCursor(ALICE, 0, 0, True)]) == "read"
