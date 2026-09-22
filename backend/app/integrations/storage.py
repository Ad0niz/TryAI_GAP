"""Document storage via Azure Blob, with local filesystem fallback for dev."""
import os
import uuid
from datetime import datetime, timedelta

from app.core.config import settings


def _blob_service():
    from azure.storage.blob import BlobServiceClient
    return BlobServiceClient.from_connection_string(settings.azure_storage_connection_string)


async def upload_bytes(data: bytes, filename: str, content_type: str) -> str:
    """Returns a storage_key referencing the stored object."""
    key = f"{uuid.uuid4().hex}/{filename}"
    if not settings.azure_storage_connection_string:
        base = os.path.join(settings.local_storage_dir, os.path.dirname(key))
        os.makedirs(base, exist_ok=True)
        with open(os.path.join(settings.local_storage_dir, key), "wb") as fh:
            fh.write(data)
        return key
    from azure.storage.blob import ContentSettings
    svc = _blob_service()
    container = svc.get_container_client(settings.azure_storage_container)
    try:
        container.create_container()
    except Exception:
        pass
    container.upload_blob(name=key, data=data, overwrite=True,
                          content_settings=ContentSettings(content_type=content_type))
    return key


def signed_url(storage_key: str, minutes: int = 30) -> str:
    if not settings.azure_storage_connection_string:
        return f"/local-files/{storage_key}"
    from azure.storage.blob import generate_blob_sas, BlobSasPermissions
    svc = _blob_service()
    sas = generate_blob_sas(
        account_name=svc.account_name,
        container_name=settings.azure_storage_container,
        blob_name=storage_key,
        account_key=svc.credential.account_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.utcnow() + timedelta(minutes=minutes),
    )
    return f"{svc.url}{settings.azure_storage_container}/{storage_key}?{sas}"
