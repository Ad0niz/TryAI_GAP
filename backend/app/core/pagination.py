from math import ceil


def page_meta(page: int, page_size: int, total: int) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, ceil(total / page_size)) if total else 1,
    }


def offset(page: int, page_size: int) -> int:
    return (max(1, page) - 1) * min(max(1, page_size), 100)
