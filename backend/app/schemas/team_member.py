from typing import List, Optional

from pydantic import BaseModel, EmailStr


class AvailabilityEntry(BaseModel):
    day: str
    value: str


# Partner supplies only email + role when inviting.
class TeamMemberInviteCreate(BaseModel):
    email: EmailStr
    role: str


# Partner edits these later (or the advisor's name is set on accept).
class TeamMemberUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    languages: Optional[List[str]] = None
    availability_on: Optional[bool] = None
    availability_schedule: Optional[List[AvailabilityEntry]] = None


# API response. `languages` / `availability_schedule` are decoded from the
# model's JSON text columns by the endpoint serializer, so this is a plain
# BaseModel (not from_attributes) — see endpoints/team.py::serialize_member.
class TeamMember(BaseModel):
    id: int
    boutique_id: int
    email: EmailStr
    role: str
    name: Optional[str] = None
    languages: List[str] = []
    availability_on: bool = False
    availability_schedule: List[AvailabilityEntry] = []
    status: str  # pending | active
    invited_at: Optional[str] = None
    accepted_at: Optional[str] = None
