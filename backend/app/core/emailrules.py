"""Shared email syntax validation and corporate-provider policy; no DNS lookups."""
from email_validator import EmailNotValidError, validate_email

FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
    "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com",
    "proton.me", "protonmail.com", "gmx.com", "gmx.net", "zoho.com",
    "mail.com", "mail.ru", "yandex.com", "yandex.ru", "pm.me",
}


def parse_domain(email: str) -> str | None:
    if not isinstance(email, str):
        return None
    try:
        address = validate_email(
            email.strip(), check_deliverability=False,
            # Syntax only: permit reserved .test domains used by isolated QA.
            # This does not assert DNS availability or mailbox ownership.
            test_environment=True,
        )
    except EmailNotValidError:
        return None
    # Keep the existing requirement for a domain with a suffix, even in QA.
    return address.domain.lower() if "." in address.domain else None


def is_valid_email(email: str) -> bool:
    return parse_domain(email) is not None


def is_corporate_email(email: str) -> bool:
    domain = parse_domain(email)
    if not domain:
        return False
    return domain not in FREE_EMAIL_DOMAINS
