from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.schemas.users import MeOut


class OtpRequestIn(BaseModel):
    phone: Annotated[str, StringConstraints(max_length=32)]


class OtpRequestOut(BaseModel):
    is_new_user: bool


class VerifyOtpIn(BaseModel):
    phone: Annotated[str, StringConstraints(max_length=32)]
    code: Annotated[str, StringConstraints(max_length=12)]
    device_name: Annotated[str, StringConstraints(min_length=1, max_length=80)] = "Browser"


class AuthOut(BaseModel):
    token: str
    user: MeOut
    is_new_user: bool
