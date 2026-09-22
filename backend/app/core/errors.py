"""Unified error format:  {"error": {"code","message","field","request_id"}}"""
from typing import Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


class APIError(Exception):
    """Raise anywhere in the app to return a structured error."""

    def __init__(self, status_code: int, code: str, message: str, field: Optional[str] = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field
        super().__init__(message)


def _payload(code: str, message: str, request_id: str, field: Optional[str] = None) -> dict:
    err = {"code": code, "message": message, "request_id": request_id}
    if field:
        err["field"] = field
    return {"error": err}


def _rid(request: Request) -> str:
    return getattr(request.state, "request_id", "-")


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code,
                        content=_payload(exc.code, exc.message, _rid(request), exc.field))


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    loc = first.get("loc", [])
    field = ".".join(str(p) for p in loc[1:]) if len(loc) > 1 else (str(loc[0]) if loc else None)
    msg = first.get("msg", "La solicitud contiene campos inválidos.")
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST,
                        content=_payload("VALIDATION_ERROR", msg, _rid(request), field))


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = {
        400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN",
        404: "RESOURCE_NOT_FOUND", 409: "CONFLICT", 429: "RATE_LIMITED",
    }.get(exc.status_code, "HTTP_ERROR")
    message = exc.detail if isinstance(exc.detail, str) else "Error de solicitud."
    return JSONResponse(status_code=exc.status_code, content=_payload(code, message, _rid(request)))


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500,
                        content=_payload("INTERNAL_ERROR", "Error interno del servidor.", _rid(request)))


def register_error_handlers(app) -> None:
    app.add_exception_handler(APIError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
