"""Email via Azure Communication Services, with console fallback for dev."""
import asyncio
import logging
from app.core.config import settings

log = logging.getLogger("app.email")


async def send_email(to: str, subject: str, html: str, *, sensitive: bool = False) -> None:
    if not settings.acs_connection_string:
        if sensitive or not settings.is_dev:
            log.warning("Email provider unavailable; message content omitted")
            raise RuntimeError("Email provider unavailable")
        log.info("EMAIL (console fallback) to=%s subject=%s\n%s", to, subject, html)
        return
    # The Azure client is synchronous; keep delivery off the request event loop.
    await asyncio.to_thread(_send_acs_email, to, subject, html)


def _send_acs_email(to: str, subject: str, html: str) -> None:
    # Lazy import so the SDK is optional in dev
    from azure.communication.email import EmailClient
    client = EmailClient.from_connection_string(settings.acs_connection_string)
    message = {
        "senderAddress": settings.acs_sender_address,
        "recipients": {"to": [{"address": to}]},
        "content": {"subject": subject, "html": html},
    }
    poller = client.begin_send(message)
    poller.result()


def magic_link_email(link: str, locale: str = "es") -> tuple[str, str]:
    subjects = {
        "es": "Tu enlace de acceso", "en": "Your sign-in link",
        "de": "Ihr Anmeldelink", "pt": "Seu link de acesso",
    }
    body = {
        "es": f'<p>Accede con este enlace (válido 15 min):</p><p><a href="{link}">Iniciar sesión</a></p>',
        "en": f'<p>Sign in with this link (valid 15 min):</p><p><a href="{link}">Sign in</a></p>',
        "de": f'<p>Melden Sie sich über diesen Link an (15 Min gültig):</p><p><a href="{link}">Anmelden</a></p>',
        "pt": f'<p>Acesse com este link (válido 15 min):</p><p><a href="{link}">Entrar</a></p>',
    }
    return subjects.get(locale, subjects["es"]), body.get(locale, body["es"])
