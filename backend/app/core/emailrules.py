"""Corporate-email validation: reject free/consumer providers."""
import re

FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
    "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com",
    "proton.me", "protonmail.com", "gmx.com", "gmx.net", "zoho.com",
    "mail.com", "mail.ru", "yandex.com", "yandex.ru", "pm.me",
}

_EMAIL_RE = re.compile(r"^[^\s@]+@([^\s@]+\.[^\s@]{2,})$")


def parse_domain(email: str) -> str | None:
    m = _EMAIL_RE.match((email or "").strip().lower())
    return m.group(1) if m else None


def is_valid_email(email: str) -> bool:
    return parse_domain(email) is not None


def is_corporate_email(email: str) -> bool:
    domain = parse_domain(email)
    if not domain:
        return False
    return domain not in FREE_EMAIL_DOMAINS
