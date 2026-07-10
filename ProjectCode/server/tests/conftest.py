"""
Shared pytest fixtures for backend API tests.

Every test runs against a fresh in-memory SQLite database via
dependency_overrides[get_db] — the dev/prod databases are never touched.
TestClient is used WITHOUT the lifespan context so startup seeding
(_seed_settings_on_startup) does not run against the real SessionLocal.
"""
import os
import sys

# Must be set BEFORE importing database.py (load_dotenv won't override them)
os.environ['DEBUG'] = 'False'
os.environ['USE_SQLITE'] = 'True'

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from database import Base, get_db, Member  # noqa: E402
from main import app  # noqa: E402

test_engine = create_engine(
    'sqlite://',
    connect_args={'check_same_thread': False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture()
def db_session():
    """Fresh schema + session per test."""
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def client(db_session):
    """TestClient wired to the test database."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_member(db_session, status='active', uid=None, **overrides):
    """Insert a member row and return it."""
    uid = uid or f'test-uid-{status}'
    defaults = dict(
        username=f'user_{uid}',
        email=f'{uid}@test.local',
        password_hash='x',
        firebase_uid=uid,
        status=status,
        display_name=f'Test {status.title()}',
    )
    defaults.update(overrides)
    member = Member(**defaults)
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    return member


@pytest.fixture()
def admin_member(db_session):
    return make_member(db_session, status='admin', uid='admin-uid')


@pytest.fixture()
def committee_member(db_session):
    return make_member(db_session, status='committee', uid='committee-uid')


@pytest.fixture()
def regular_member(db_session):
    # 'runner' is the approved-regular-member status in MemberStatus
    return make_member(db_session, status='runner', uid='member-uid')


def auth(member):
    """Auth headers for a member fixture."""
    return {'X-Firebase-UID': member.firebase_uid}
