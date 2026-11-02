"""Organization authorization, independent of global users.role.

Legacy ownership is recognized only from a unique signup lead owner in the
organization, with no membership record for that user. Explicit memberships
(including inactive ones and leader assignments) take precedence. The lead has
no organization FK, so ambiguous historical ownership requires reconciliation. No permission check writes data.
"""
from dataclasses import dataclass
from uuid import UUID
from sqlalchemy import select
from app.core.errors import APIError
from app.models import AreaState, Assessment, Lead, OrgMember, Question, User


def forbidden():
    raise APIError(403, 'FORBIDDEN', 'No tiene permisos para esta operación.')


@dataclass(frozen=True)
class OrganizationAccess:
    admin: bool
    area_keys: frozenset[str]

    def allows_area(self, key):
        return self.admin or key in self.area_keys


async def organization_access(db, current) -> OrganizationAccess:
    if not current.organization_id or current.user.status in ('disabled', 'invited'):
        return OrganizationAccess(False, frozenset())
    memberships = (await db.execute(select(OrgMember).where(
        OrgMember.organization_id == current.organization_id,
        OrgMember.user_id == current.id,
    ))).scalars().all()
    active = [m for m in memberships if m.status == 'active']
    if any(m.role == 'admin' for m in active):
        return OrganizationAccess(True, frozenset())
    # A missing membership is never sufficient evidence of ownership.
    if not memberships:
        owners = set((await db.execute(select(Lead.user_id).join(User, User.id == Lead.user_id)
            .where(User.organization_id == current.organization_id).distinct())).scalars().all())
        if owners == {current.id}:
            return OrganizationAccess(True, frozenset())
    return OrganizationAccess(False, frozenset(m.area_key for m in active if m.role == 'leader' and m.area_key))


async def require_org_admin(db, current):
    access = await organization_access(db, current)
    if not access.admin:
        forbidden()
    return access


async def require_org_member(db, current):
    access = await organization_access(db, current)
    if not access.admin and not access.area_keys:
        forbidden()
    return access


async def authorize_module(db, current, module, area_key=None):
    access = await require_org_member(db, current)
    if module == 'maturity':
        if not access.admin:
            forbidden()
    elif module == 'area':
        if not area_key or not access.allows_area(area_key):
            forbidden()
    else:
        raise APIError(400, 'VALIDATION_ERROR', 'Módulo no válido.')
    return access


async def authorize_question(db, current, assessment, question, *, write=True):
    if assessment.organization_id != current.organization_id:
        forbidden()
    await authorize_module(db, current, question.module, question.area_key)
    if write and question.module == 'area':
        active = await db.scalar(select(AreaState.id).where(
            AreaState.assessment_id == assessment.id, AreaState.area_key == question.area_key,
            AreaState.active.is_(True),
        ))
        if active is None:
            raise APIError(403, 'AREA_INACTIVE', 'El área está desactivada.')


async def authorize_document_scope(db, current, assessment_id, question_id, area_key, *, write=False):
    if assessment_id is not None:
        assessment = await db.get(Assessment, assessment_id)
        if assessment is None or assessment.organization_id != current.organization_id:
            forbidden()
    else:
        assessment = None
    question = await db.get(Question, question_id) if question_id else None
    if question_id and question is None:
        raise APIError(404, 'RESOURCE_NOT_FOUND', 'Pregunta no encontrada.')
    if question:
        if area_key and (question.module != 'area' or question.area_key != area_key):
            raise APIError(422, 'DOCUMENT_SCOPE_INVALID', 'El área no corresponde a la pregunta.')
        if assessment:
            await authorize_question(db, current, assessment, question, write=write)
        else:
            await authorize_module(db, current, question.module, question.area_key)
        return question.area_key if question.module == 'area' else None
    if area_key:
        await authorize_module(db, current, 'area', area_key)
        if write:
            active = await db.scalar(select(AreaState.id).where(AreaState.assessment_id == assessment_id,
                AreaState.area_key == area_key, AreaState.active.is_(True)))
            if active is None:
                raise APIError(403, 'AREA_INACTIVE', 'El área está desactivada.')
    else:
        await require_org_admin(db, current)
    return area_key
