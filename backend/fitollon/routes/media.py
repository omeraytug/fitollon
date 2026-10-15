from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fitollon.auth import require_user
from fitollon.db import DbSession
from fitollon.models import MediaItem

router = APIRouter(prefix="/api/media", dependencies=[Depends(require_user)])

Tag = Literal["meals", "outdoors", "progress", "gym"]
TAGS: tuple[Tag, ...] = ("meals", "outdoors", "progress", "gym")
PREVIEWS = 3  # latest items shown on each tag's card

# Files are uploaded by the frontend into Blob under this prefix; only those pathnames are accepted.
PATH_PREFIX = "media/"


class MediaCreate(BaseModel):
    kind: Literal["photo", "video"]
    tag: Tag
    caption: str | None = Field(default=None, max_length=2000)
    taken_on: date
    pathname: str = Field(min_length=7, max_length=500)
    thumb_pathname: str = Field(min_length=7, max_length=500)
    content_type: str = Field(max_length=100)
    size_bytes: int = Field(ge=0)
    width: int | None = None
    height: int | None = None
    duration_s: float | None = None


class MediaUpdate(BaseModel):
    tag: Tag | None = None
    caption: str | None = Field(default=None, max_length=2000)
    taken_on: date | None = None


def media_dict(m: MediaItem) -> dict:
    return {
        "id": m.id,
        "kind": m.kind,
        "tag": m.tag,
        "caption": m.caption,
        "taken_on": m.taken_on.isoformat(),
        "pathname": m.pathname,
        "thumb_pathname": m.thumb_pathname,
        "content_type": m.content_type,
        "width": m.width,
        "height": m.height,
        "duration_s": m.duration_s,
    }


def _newest_first(query):
    return query.order_by(MediaItem.taken_on.desc(), MediaItem.id.desc())


@router.get("")
def list_media(tag: Tag | None = None, limit: int = Query(200, ge=1, le=500), session: Session = DbSession) -> list:
    query = select(MediaItem)
    if tag:
        query = query.where(MediaItem.tag == tag)
    return [media_dict(m) for m in session.scalars(_newest_first(query).limit(limit))]


@router.get("/summary")
def summary(session: Session = DbSession) -> dict:
    """Each tag's count and latest items (for its preview card), plus the storage used."""
    counts = dict(session.execute(select(MediaItem.tag, func.count()).group_by(MediaItem.tag)).all())
    tags = []
    for tag in TAGS:
        latest = session.scalars(_newest_first(select(MediaItem).where(MediaItem.tag == tag)).limit(PREVIEWS)).all()
        tags.append({"tag": tag, "count": counts.get(tag, 0), "latest": [media_dict(m) for m in latest]})
    return {
        "tags": tags,
        "total": sum(counts.values()),
        "bytes": session.scalar(select(func.coalesce(func.sum(MediaItem.size_bytes), 0))),
    }


@router.post("")
def create_media(body: MediaCreate, session: Session = DbSession) -> dict:
    if not (body.pathname.startswith(PATH_PREFIX) and body.thumb_pathname.startswith(PATH_PREFIX)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unexpected file location")
    item = MediaItem(**body.model_dump())
    session.add(item)
    session.flush()
    return media_dict(item)


@router.patch("/{media_id}")
def update_media(media_id: int, body: MediaUpdate, session: Session = DbSession) -> dict:
    item = session.get(MediaItem, media_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        if field != "caption" and value is None:
            continue
        setattr(item, field, value)
    return media_dict(item)


@router.delete("/{media_id}")
def delete_media(media_id: int, session: Session = DbSession) -> dict:
    """Removes the catalog entry; the frontend then deletes the returned files from Blob."""
    item = session.get(MediaItem, media_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    pathnames = [item.pathname, item.thumb_pathname]
    session.delete(item)
    return {"ok": True, "pathnames": pathnames}


def hero_media(session: Session) -> dict | None:
    """Home's banner: the latest outdoors photo, else the latest gym photo. Never meals or progress photos."""
    for tag in ("outdoors", "gym"):
        item = session.scalars(
            _newest_first(select(MediaItem).where(MediaItem.tag == tag, MediaItem.kind == "photo")).limit(1)
        ).first()
        if item:
            return media_dict(item)
    return None
