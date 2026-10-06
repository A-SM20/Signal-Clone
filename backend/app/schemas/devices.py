from datetime import datetime

from pydantic import BaseModel


class DeviceOut(BaseModel):
    id: int
    name: str
    is_primary: bool
    is_current: bool
    created_at: datetime
    last_active_at: datetime
