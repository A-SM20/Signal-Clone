from typing import Annotated

from pydantic import BaseModel, StringConstraints, model_validator


class AddContactIn(BaseModel):
    phone: Annotated[str, StringConstraints(max_length=32)] | None = None
    username: Annotated[str, StringConstraints(max_length=40)] | None = None

    @model_validator(mode="after")
    def _one_identifier(self):
        if not (self.phone or self.username):
            raise ValueError("provide phone or username")
        return self

    @property
    def query(self) -> str:
        return (self.username or self.phone or "").strip()
