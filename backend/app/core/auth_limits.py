"""Bounded, per-process authentication throttling; no raw identities are retained."""
from collections import OrderedDict, deque
from threading import Lock
from time import monotonic

from fastapi import Request

from app.core.errors import APIError
from app.core.security import hash_token


class AuthLimiter:
    def __init__(self):
        self.entries = OrderedDict()
        self.lock = Lock()

    def check(self, action: str, identity: str, host: str) -> None:
        now = monotonic()
        account_limit = 5 if action in ('login', 'register_request', 'reset_request', 'magic_request') else 30
        policies = [(f'{action}:identity:{hash_token(identity.strip().lower())}', account_limit, 900),
                    (f'{action}:ip:{hash_token(host)}', 60, 60)]
        with self.lock:
            for key in list(self.entries):
                if not self.entries[key] or self.entries[key][-1] <= now - 900:
                    del self.entries[key]
            if len(self.entries) >= 10000:
                raise APIError(429, 'RATE_LIMITED', 'Demasiados intentos. Intenta más tarde.')
            for key, limit, window in policies:
                bucket = self.entries.setdefault(key, deque())
                while bucket and bucket[0] <= now - window:
                    bucket.popleft()
                if len(bucket) >= limit:
                    raise APIError(429, 'RATE_LIMITED', 'Demasiados intentos. Intenta más tarde.')
            for key, _, _ in policies:
                self.entries[key].append(now)

    def forgive_login(self, email: str) -> None:
        with self.lock:
            self.entries.pop(f'login:identity:{hash_token(email.strip().lower())}', None)


def auth_limit(request: Request, action: str, identity: str) -> AuthLimiter:
    if not hasattr(request.app.state, 'auth_limiter'):
        request.app.state.auth_limiter = AuthLimiter()
    limiter = request.app.state.auth_limiter
    limiter.check(action, identity, request.client.host if request.client else 'unknown')
    return limiter
