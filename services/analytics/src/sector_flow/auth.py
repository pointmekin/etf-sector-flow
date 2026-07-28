import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .config import get_settings

security = HTTPBasic(auto_error=False)


def require_basic_auth(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(security)] = None,
) -> str:
    settings = get_settings()
    configured = bool(settings.basic_auth_username and settings.basic_auth_password)
    supplied_username = credentials.username if credentials else ""
    supplied_password = credentials.password if credentials else ""
    username_valid = secrets.compare_digest(supplied_username, settings.basic_auth_username)
    password_valid = secrets.compare_digest(supplied_password, settings.basic_auth_password)
    valid = configured and credentials is not None and username_valid and password_valid
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username
