from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class Page(BaseModel, Generic[T]):
    items: List[T]
    meta: PageMeta


class MessageResponse(BaseModel):
    status: str
    message: Optional[str] = None
