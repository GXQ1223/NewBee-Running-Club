"""Tests for routes/engagement.py (comments, likes, reactions, settings, batch)."""
from database import Comment, EventCommentSettings, Like, Reaction
from tests.conftest import auth, make_member
from tests.helpers_events import make_event


def make_comment(db_session, event, member, content='hello', **overrides):
    comment = Comment(
        event_id=event.id,
        member_id=member.id,
        firebase_uid=member.firebase_uid,
        content=content,
        author_name=member.display_name,
        **overrides,
    )
    db_session.add(comment)
    db_session.commit()
    db_session.refresh(comment)
    return comment


def disable_features(db_session, event, **flags):
    settings = EventCommentSettings(event_id=event.id, **flags)
    db_session.add(settings)
    db_session.commit()
    return settings


# ---------- Comments: public list ----------

def test_get_comments_event_404(client):
    assert client.get('/api/events/999/comments').status_code == 404


def test_get_comments_hides_hidden_and_orders_highlighted_first(client, db_session, regular_member):
    event = make_event(db_session)
    make_comment(db_session, event, regular_member, content='normal')
    make_comment(db_session, event, regular_member, content='starred', is_highlighted=True)
    make_comment(db_session, event, regular_member, content='bad', is_hidden=True)

    body = client.get(f'/api/events/{event.id}/comments').json()
    assert [c['content'] for c in body] == ['starred', 'normal']


# ---------- Comments: admin list ----------

def test_get_all_comments_requires_admin(client, db_session, committee_member):
    event = make_event(db_session)
    assert client.get(f'/api/events/{event.id}/comments/all').status_code == 401
    resp = client.get(f'/api/events/{event.id}/comments/all', headers=auth(committee_member))
    assert resp.status_code == 403


def test_get_all_comments_event_404(client, admin_member):
    resp = client.get('/api/events/999/comments/all', headers=auth(admin_member))
    assert resp.status_code == 404


def test_get_all_comments_includes_hidden(client, db_session, admin_member, regular_member):
    event = make_event(db_session)
    make_comment(db_session, event, regular_member, content='visible')
    make_comment(db_session, event, regular_member, content='hidden one', is_hidden=True)

    body = client.get(f'/api/events/{event.id}/comments/all', headers=auth(admin_member)).json()
    assert len(body) == 2
    assert {c['content']: c['is_hidden'] for c in body} == {'visible': False, 'hidden one': True}


# ---------- Comments: create ----------

def test_create_comment_requires_login(client, db_session):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/comments', json={'content': 'hi'})
    assert resp.status_code == 401


def test_create_comment_unknown_uid(client, db_session):
    event = make_event(db_session)
    resp = client.post(
        f'/api/events/{event.id}/comments',
        json={'content': 'hi'},
        headers={'X-Firebase-UID': 'ghost'},
    )
    assert resp.status_code == 401


def test_create_comment_event_404(client, regular_member):
    resp = client.post('/api/events/999/comments', json={'content': 'hi'},
                       headers=auth(regular_member))
    assert resp.status_code == 404


def test_create_comment_disabled(client, db_session, regular_member):
    event = make_event(db_session)
    disable_features(db_session, event, comments_enabled=False)
    resp = client.post(f'/api/events/{event.id}/comments', json={'content': 'hi'},
                       headers=auth(regular_member))
    assert resp.status_code == 403


def test_create_comment_success(client, db_session, regular_member):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/comments', json={'content': 'great run!'},
                       headers=auth(regular_member))
    assert resp.status_code == 200
    body = resp.json()
    assert body['content'] == 'great run!'
    assert body['author_name'] == regular_member.display_name
    assert body['member_id'] == regular_member.id


def test_create_comment_author_falls_back_to_username(client, db_session):
    member = make_member(db_session, uid='no-display', display_name=None)
    event = make_event(db_session)
    body = client.post(f'/api/events/{event.id}/comments', json={'content': 'yo'},
                       headers=auth(member)).json()
    assert body['author_name'] == member.username


def test_create_comment_empty_content_validation(client, db_session, regular_member):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/comments', json={'content': ''},
                       headers=auth(regular_member))
    assert resp.status_code == 422


# ---------- Comments: delete ----------

def test_delete_comment_404(client, regular_member):
    resp = client.delete('/api/comments/999', headers=auth(regular_member))
    assert resp.status_code == 404


def test_delete_own_comment(client, db_session, regular_member):
    event = make_event(db_session)
    comment = make_comment(db_session, event, regular_member)
    resp = client.delete(f'/api/comments/{comment.id}', headers=auth(regular_member))
    assert resp.status_code == 200
    assert db_session.query(Comment).count() == 0


def test_delete_others_comment_forbidden(client, db_session, regular_member):
    other = make_member(db_session, uid='other-uid')
    event = make_event(db_session)
    comment = make_comment(db_session, event, other)
    resp = client.delete(f'/api/comments/{comment.id}', headers=auth(regular_member))
    assert resp.status_code == 403


def test_committee_can_delete_any_comment(client, db_session, committee_member, regular_member):
    event = make_event(db_session)
    comment = make_comment(db_session, event, regular_member)
    resp = client.delete(f'/api/comments/{comment.id}', headers=auth(committee_member))
    assert resp.status_code == 200


# ---------- Comments: moderation ----------

def test_highlight_toggle_requires_admin(client, db_session, regular_member):
    event = make_event(db_session)
    comment = make_comment(db_session, event, regular_member)
    resp = client.put(f'/api/comments/{comment.id}/highlight', headers=auth(regular_member))
    assert resp.status_code == 403


def test_highlight_toggle_404(client, admin_member):
    resp = client.put('/api/comments/999/highlight', headers=auth(admin_member))
    assert resp.status_code == 404


def test_highlight_toggle_on_off(client, db_session, admin_member, regular_member):
    event = make_event(db_session)
    comment = make_comment(db_session, event, regular_member)

    body = client.put(f'/api/comments/{comment.id}/highlight', headers=auth(admin_member)).json()
    assert body['is_highlighted'] is True
    body = client.put(f'/api/comments/{comment.id}/highlight', headers=auth(admin_member)).json()
    assert body['is_highlighted'] is False


def test_hide_comment_404(client, admin_member):
    resp = client.put('/api/comments/999/hide', json={'reason': 'spam'},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_hide_then_unhide_comment(client, db_session, admin_member, regular_member):
    event = make_event(db_session)
    comment = make_comment(db_session, event, regular_member)

    resp = client.put(f'/api/comments/{comment.id}/hide', json={'reason': 'spam'},
                      headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(comment)
    assert comment.is_hidden is True
    assert comment.hidden_by == admin_member.id
    assert comment.hidden_reason == 'spam'
    assert comment.hidden_at is not None
    assert client.get(f'/api/events/{event.id}/comments').json() == []

    resp = client.put(f'/api/comments/{comment.id}/unhide', headers=auth(admin_member))
    assert resp.status_code == 200
    db_session.refresh(comment)
    assert comment.is_hidden is False
    assert comment.hidden_by is None
    assert comment.hidden_reason is None
    assert len(client.get(f'/api/events/{event.id}/comments').json()) == 1


def test_unhide_comment_404(client, admin_member):
    resp = client.put('/api/comments/999/unhide', headers=auth(admin_member))
    assert resp.status_code == 404


# ---------- Likes ----------

def test_get_likes_event_404(client):
    assert client.get('/api/events/999/likes').status_code == 404


def test_get_likes_anonymous_visitor(client, db_session, regular_member):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, member_id=regular_member.id))
    db_session.commit()
    body = client.get(f'/api/events/{event.id}/likes').json()
    assert body == {'count': 1, 'user_liked': False}


def test_get_likes_member_liked(client, db_session, regular_member):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, member_id=regular_member.id))
    db_session.commit()
    body = client.get(f'/api/events/{event.id}/likes', headers=auth(regular_member)).json()
    assert body == {'count': 1, 'user_liked': True}


def test_get_likes_anonymous_id_liked(client, db_session):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, anonymous_id='anon-1'))
    db_session.commit()
    body = client.get(f'/api/events/{event.id}/likes', params={'anonymous_id': 'anon-1'}).json()
    assert body == {'count': 1, 'user_liked': True}
    body = client.get(f'/api/events/{event.id}/likes', params={'anonymous_id': 'anon-2'}).json()
    assert body == {'count': 1, 'user_liked': False}


def test_toggle_like_event_404(client, regular_member):
    resp = client.post('/api/events/999/likes', json={}, headers=auth(regular_member))
    assert resp.status_code == 404


def test_toggle_like_disabled(client, db_session, regular_member):
    event = make_event(db_session)
    disable_features(db_session, event, likes_enabled=False)
    resp = client.post(f'/api/events/{event.id}/likes', json={}, headers=auth(regular_member))
    assert resp.status_code == 403


def test_toggle_like_anonymous_requires_anonymous_id(client, db_session):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/likes', json={})
    assert resp.status_code == 400


def test_toggle_like_member_like_then_unlike(client, db_session, regular_member):
    event = make_event(db_session)
    body = client.post(f'/api/events/{event.id}/likes', json={},
                       headers=auth(regular_member)).json()
    assert body == {'count': 1, 'user_liked': True}
    body = client.post(f'/api/events/{event.id}/likes', json={},
                       headers=auth(regular_member)).json()
    assert body == {'count': 0, 'user_liked': False}


def test_toggle_like_anonymous_like_then_unlike(client, db_session):
    event = make_event(db_session)
    body = client.post(f'/api/events/{event.id}/likes', json={'anonymous_id': 'anon-9'}).json()
    assert body == {'count': 1, 'user_liked': True}
    body = client.post(f'/api/events/{event.id}/likes', json={'anonymous_id': 'anon-9'}).json()
    assert body == {'count': 0, 'user_liked': False}


def test_remove_like_member(client, db_session, regular_member):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, member_id=regular_member.id))
    db_session.commit()
    body = client.delete(f'/api/events/{event.id}/likes', headers=auth(regular_member)).json()
    assert body['message'] == 'Like removed'
    assert db_session.query(Like).count() == 0


def test_remove_like_anonymous(client, db_session):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, anonymous_id='anon-3'))
    db_session.commit()
    body = client.delete(f'/api/events/{event.id}/likes',
                         params={'anonymous_id': 'anon-3'}).json()
    assert body['message'] == 'Like removed'


def test_remove_like_not_found(client, db_session, regular_member):
    event = make_event(db_session)
    body = client.delete(f'/api/events/{event.id}/likes', headers=auth(regular_member)).json()
    assert body['message'] == 'Like not found'


# ---------- Reactions ----------

def test_get_reactions_event_404(client):
    assert client.get('/api/events/999/reactions').status_code == 404


def test_get_reactions_counts_and_user_flags(client, db_session, regular_member):
    other = make_member(db_session, uid='other-uid')
    event = make_event(db_session)
    db_session.add(Reaction(event_id=event.id, member_id=regular_member.id, emoji='🎉'))
    db_session.add(Reaction(event_id=event.id, member_id=other.id, emoji='🎉'))
    db_session.add(Reaction(event_id=event.id, member_id=other.id, emoji='🔥'))
    db_session.commit()

    body = client.get(f'/api/events/{event.id}/reactions', headers=auth(regular_member)).json()
    by_emoji = {r['emoji']: r for r in body['reactions']}
    assert by_emoji['🎉'] == {'emoji': '🎉', 'count': 2, 'user_reacted': True}
    assert by_emoji['🔥'] == {'emoji': '🔥', 'count': 1, 'user_reacted': False}


def test_get_reactions_anonymous_id_flags(client, db_session):
    event = make_event(db_session)
    db_session.add(Reaction(event_id=event.id, anonymous_id='anon-r', emoji='💪'))
    db_session.commit()
    body = client.get(f'/api/events/{event.id}/reactions',
                      params={'anonymous_id': 'anon-r'}).json()
    assert body['reactions'][0]['user_reacted'] is True


def test_toggle_reaction_event_404(client, regular_member):
    resp = client.post('/api/events/999/reactions', json={'emoji': '🎉'},
                       headers=auth(regular_member))
    assert resp.status_code == 404


def test_toggle_reaction_invalid_emoji(client, db_session, regular_member):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/reactions', json={'emoji': '💀'},
                       headers=auth(regular_member))
    assert resp.status_code == 400


def test_toggle_reaction_disabled(client, db_session, regular_member):
    event = make_event(db_session)
    disable_features(db_session, event, reactions_enabled=False)
    resp = client.post(f'/api/events/{event.id}/reactions', json={'emoji': '🎉'},
                       headers=auth(regular_member))
    assert resp.status_code == 403


def test_toggle_reaction_anonymous_requires_anonymous_id(client, db_session):
    event = make_event(db_session)
    resp = client.post(f'/api/events/{event.id}/reactions', json={'emoji': '🎉'})
    assert resp.status_code == 400


def test_toggle_reaction_member_add_then_remove(client, db_session, regular_member):
    event = make_event(db_session)
    body = client.post(f'/api/events/{event.id}/reactions', json={'emoji': '🐝'},
                       headers=auth(regular_member)).json()
    assert body['reactions'] == [{'emoji': '🐝', 'count': 1, 'user_reacted': True}]
    body = client.post(f'/api/events/{event.id}/reactions', json={'emoji': '🐝'},
                       headers=auth(regular_member)).json()
    assert body['reactions'] == []


def test_toggle_reaction_anonymous_add_then_remove(client, db_session):
    event = make_event(db_session)
    payload = {'emoji': '👏', 'anonymous_id': 'anon-t'}
    body = client.post(f'/api/events/{event.id}/reactions', json=payload).json()
    assert body['reactions'] == [{'emoji': '👏', 'count': 1, 'user_reacted': True}]
    body = client.post(f'/api/events/{event.id}/reactions', json=payload).json()
    assert body['reactions'] == []


def test_remove_reaction_member(client, db_session, regular_member):
    event = make_event(db_session)
    db_session.add(Reaction(event_id=event.id, member_id=regular_member.id, emoji='⭐'))
    db_session.commit()
    body = client.delete(f'/api/events/{event.id}/reactions/⭐',
                         headers=auth(regular_member)).json()
    assert body['message'] == 'Reaction removed'
    assert db_session.query(Reaction).count() == 0


def test_remove_reaction_anonymous(client, db_session):
    event = make_event(db_session)
    db_session.add(Reaction(event_id=event.id, anonymous_id='anon-d', emoji='⭐'))
    db_session.commit()
    body = client.delete(f'/api/events/{event.id}/reactions/⭐',
                         params={'anonymous_id': 'anon-d'}).json()
    assert body['message'] == 'Reaction removed'


def test_remove_reaction_not_found(client, db_session, regular_member):
    event = make_event(db_session)
    body = client.delete(f'/api/events/{event.id}/reactions/⭐',
                         headers=auth(regular_member)).json()
    assert body['message'] == 'Reaction not found'


# ---------- Aggregated engagement ----------

def test_engagement_event_404(client):
    assert client.get('/api/events/999/engagement').status_code == 404


def test_engagement_full_payload_member(client, db_session, regular_member):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, member_id=regular_member.id))
    db_session.add(Reaction(event_id=event.id, member_id=regular_member.id, emoji='🔥'))
    make_comment(db_session, event, regular_member, content='visible')
    make_comment(db_session, event, regular_member, content='hidden', is_hidden=True)

    body = client.get(f'/api/events/{event.id}/engagement', headers=auth(regular_member)).json()
    assert body['event_id'] == event.id
    assert body['likes'] == {'count': 1, 'user_liked': True}
    assert body['reactions'] == [{'emoji': '🔥', 'count': 1, 'user_reacted': True}]
    assert body['comment_count'] == 1  # hidden comment excluded
    assert body['comments_enabled'] is True
    assert body['likes_enabled'] is True
    assert body['reactions_enabled'] is True


def test_engagement_anonymous_id(client, db_session):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, anonymous_id='anon-e'))
    db_session.add(Reaction(event_id=event.id, anonymous_id='anon-e', emoji='🏃'))
    db_session.commit()

    body = client.get(f'/api/events/{event.id}/engagement',
                      params={'anonymous_id': 'anon-e'}).json()
    assert body['likes'] == {'count': 1, 'user_liked': True}
    assert body['reactions'] == [{'emoji': '🏃', 'count': 1, 'user_reacted': True}]


def test_engagement_plain_anonymous(client, db_session):
    event = make_event(db_session)
    body = client.get(f'/api/events/{event.id}/engagement').json()
    assert body['likes'] == {'count': 0, 'user_liked': False}
    assert body['reactions'] == []
    assert body['comment_count'] == 0


# ---------- Batch engagement ----------

def test_batch_engagement_skips_missing_events(client, db_session, regular_member):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, member_id=regular_member.id))
    db_session.add(Reaction(event_id=event.id, member_id=regular_member.id, emoji='❤️'))
    make_comment(db_session, event, regular_member)

    resp = client.post('/api/events/engagement/batch',
                       json={'event_ids': [event.id, 999]},
                       headers=auth(regular_member))
    assert resp.status_code == 200
    engagements = resp.json()['engagements']
    assert list(engagements.keys()) == [str(event.id)]
    data = engagements[str(event.id)]
    assert data['likes'] == {'count': 1, 'user_liked': True}
    assert data['reactions'] == [{'emoji': '❤️', 'count': 1, 'user_reacted': True}]
    assert data['comment_count'] == 1


def test_batch_engagement_anonymous_id(client, db_session):
    event = make_event(db_session)
    db_session.add(Like(event_id=event.id, anonymous_id='anon-b'))
    db_session.add(Reaction(event_id=event.id, anonymous_id='anon-b', emoji='🎉'))
    db_session.commit()

    body = client.post('/api/events/engagement/batch',
                       json={'event_ids': [event.id], 'anonymous_id': 'anon-b'}).json()
    data = body['engagements'][str(event.id)]
    assert data['likes'] == {'count': 1, 'user_liked': True}
    assert data['reactions'][0]['user_reacted'] is True


def test_batch_engagement_plain_anonymous(client, db_session):
    event = make_event(db_session)
    body = client.post('/api/events/engagement/batch',
                       json={'event_ids': [event.id]}).json()
    data = body['engagements'][str(event.id)]
    assert data['likes'] == {'count': 0, 'user_liked': False}


# ---------- Event settings ----------

def test_get_settings_event_404(client):
    assert client.get('/api/events/999/settings').status_code == 404


def test_get_settings_creates_defaults(client, db_session):
    event = make_event(db_session)
    body = client.get(f'/api/events/{event.id}/settings').json()
    assert body['event_id'] == event.id
    assert body['comments_enabled'] is True
    assert body['likes_enabled'] is True
    assert body['reactions_enabled'] is True
    assert body['closed_at'] is None


def test_update_settings_requires_admin(client, db_session, committee_member):
    event = make_event(db_session)
    resp = client.put(f'/api/events/{event.id}/settings', json={'comments_enabled': False})
    assert resp.status_code == 401
    resp = client.put(f'/api/events/{event.id}/settings', json={'comments_enabled': False},
                      headers=auth(committee_member))
    assert resp.status_code == 403


def test_update_settings_event_404(client, admin_member):
    resp = client.put('/api/events/999/settings', json={'comments_enabled': False},
                      headers=auth(admin_member))
    assert resp.status_code == 404


def test_update_settings_disable_sets_closed_info(client, db_session, admin_member):
    event = make_event(db_session)
    body = client.put(
        f'/api/events/{event.id}/settings',
        json={'comments_enabled': False, 'closed_reason': 'event over'},
        headers=auth(admin_member),
    ).json()
    assert body['comments_enabled'] is False
    assert body['closed_reason'] == 'event over'
    assert body['closed_at'] is not None
    assert body['closed_by'] == admin_member.id


def test_update_settings_enable_does_not_set_closed_info(client, db_session, admin_member):
    event = make_event(db_session)
    body = client.put(
        f'/api/events/{event.id}/settings',
        json={'likes_enabled': True},
        headers=auth(admin_member),
    ).json()
    assert body['likes_enabled'] is True
    assert body['closed_at'] is None
    assert body['closed_by'] is None
