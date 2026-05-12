from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.gateway.deps import get_config, get_current_user
from deerflow.models.factory import create_chat_model
from deerflow.persistence.engine import get_session_factory
from deerflow.persistence.training import (
    ProfileRevisionRow,
    ReviewReportRow,
    RoleProfileRow,
    ScenarioProfileRow,
    SimulationMessageRow,
    SimulationSessionRow,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/training", tags=["training"])

RoleType = Literal["customer", "agent"]
SpeakerType = Literal["customer", "agent"]


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _row_dict(row: Any) -> dict[str, Any]:
    data = row.to_dict() if hasattr(row, "to_dict") else dict(row)
    for key, value in list(data.items()):
        if isinstance(value, datetime):
            data[key] = value.isoformat()
    return data


def _extract_json(text: str) -> tuple[dict[str, Any] | None, str | None]:
    text = text.strip()
    candidates = [text]
    for match in re.finditer(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE):
        candidates.append(match.group(1).strip())

    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        candidates.append(text[first : last + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed, None
        except json.JSONDecodeError as exc:
            last_error = str(exc)
    return None, locals().get("last_error", "No JSON object found")


async def _invoke_json_agent(system_prompt: str, user_payload: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    """Invoke the configured DeerFlow chat model and parse a JSON object.

    The training MVP keeps AI integration intentionally thin: prompt template,
    existing model factory, JSON parsing, and a deterministic fallback if the
    model fails or produces malformed JSON.
    """

    try:
        model = create_chat_model(thinking_enabled=False)
        response = await model.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=json.dumps(user_payload, ensure_ascii=False, default=_json_default)),
            ]
        )
        content = response.content if isinstance(response.content, str) else json.dumps(response.content, ensure_ascii=False)
        parsed, error = _extract_json(content)
        if parsed is not None:
            return parsed
        return {**fallback, "raw_text": content, "parse_error": error}
    except Exception as exc:
        logger.exception("Insurance training AI call failed")
        return {**fallback, "raw_text": "", "parse_error": str(exc)}


def _role_parse_fallback(role_type: str, name: str, description: str) -> dict[str, Any]:
    tags = ["家庭保障", "低信任"] if role_type == "customer" else ["训练中", "顾问型"]
    return {
        "summary": description[:80] or name,
        "structured_profile": {
            "basic_info": {"name": name},
            "insurance_context": {},
            "personality": {},
            "communication_style": {},
            "objections": [],
            "triggers": [],
        },
        "tags": tags,
        "missing_fields": [],
        "suggestions": ["补充收入、家庭结构、主要顾虑和训练目标。"],
    }


def _scenario_parse_fallback(name: str, description: str) -> dict[str, Any]:
    return {
        "summary": description[:80] or name,
        "sales_stage": "first_meeting",
        "product_type": "critical_illness",
        "difficulty": "medium",
        "recommended_turns": 8,
        "structured_scenario": {
            "customer_state": {"trust_level": "low"},
            "agent_goal": ["建立信任", "完成需求挖掘"],
            "constraints": ["不得承诺收益", "不得夸大保障", "不得强迫购买"],
            "possible_objections": ["我先了解一下", "预算有限", "担心理赔困难"],
            "focus_points": ["信任建立", "需求挖掘", "异议处理"],
        },
    }


ROLE_PARSE_PROMPT = """你是保险销售训练系统的角色解析 Agent。请把用户输入拆解成结构化角色画像。
只输出 JSON，不要输出 markdown。
字段：
summary, structured_profile, tags, missing_fields, suggestions。
customer 画像包含 basic_info, insurance_context, personality, communication_style, objections, triggers。
agent 画像包含 basic_info, sales_style, capabilities, weaknesses, training_goals, compliance_risks。
不要编造过度具体的隐私信息，无法判断的字段留空或放入 missing_fields。"""

SCENARIO_PARSE_PROMPT = """你是保险销售训练系统的场景解析 Agent。请把用户输入拆解成结构化销售训练场景。
只输出 JSON，不要输出 markdown。
字段：
summary, sales_stage, product_type, difficulty, recommended_turns, structured_scenario。
structured_scenario 包含 customer_state, agent_goal, constraints, possible_objections, focus_points。
对话约束必须包含基本保险合规要求。"""

DIALOGUE_PROMPT = """你是保险销售训练系统中的{speaker_name}。
只输出一句自然对话，不要输出分析、标签或 JSON。
你必须遵守画像、场景和历史对话，不要暴露完整内心设定。
客户可以犹豫、追问、提出异议；代理人要围绕场景目标推进，并避免承诺收益、夸大保障、贬低同业、诱导隐瞒健康情况。
单次回复不超过 90 个中文字。"""

REVIEW_PROMPT = """你是保险销售训练系统的复盘 Agent。请根据完整对话生成训练复盘。
只输出 JSON，不要输出 markdown。
字段：
summary,
report: {scores, strengths, weaknesses, customer_reactions, good_phrases, bad_phrases, next_training_advice, compliance_risks},
customer_profile_suggestions,
agent_profile_upgrade_suggestions。
scores 使用 1-5 分，包含 need_discovery, trust_building, empathy, product_explanation, objection_handling, closing, compliance, overall。
画像建议只给建议，不要假设已经自动应用。"""


class ParseRoleRequest(BaseModel):
    role_type: RoleType
    name: str = Field(min_length=1, max_length=200)
    basic_fields: dict[str, Any] = Field(default_factory=dict)
    description: str = Field(default="", max_length=4000)


class RoleUpsertRequest(BaseModel):
    role_type: RoleType
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    summary: str = ""
    structured_profile: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    avatar_url: str | None = None


class ParseScenarioRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    basic_fields: dict[str, Any] = Field(default_factory=dict)
    description: str = Field(default="", max_length=4000)


class ScenarioUpsertRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    summary: str = ""
    sales_stage: str = ""
    product_type: str = ""
    difficulty: str = "medium"
    recommended_turns: int = 8
    structured_scenario: dict[str, Any] = Field(default_factory=dict)

    @field_validator("recommended_turns")
    @classmethod
    def validate_turns(cls, value: int) -> int:
        return max(2, min(value, 20))


class SimulationCreateRequest(BaseModel):
    customer_role_id: str
    agent_role_id: str
    scenario_id: str
    max_turns: int = 8

    @field_validator("max_turns")
    @classmethod
    def validate_turns(cls, value: int) -> int:
        return max(2, min(value, 20))


class SimulationRunRequest(BaseModel):
    mode: Literal["auto"] = "auto"


class RevisionPreviewRequest(BaseModel):
    role_id: str
    revision_type: Literal["customer_refinement", "agent_upgrade"]


class RevisionApplyRequest(BaseModel):
    role_id: str
    source_session_id: str | None = None
    source_report_id: str | None = None
    change_type: str
    before: dict[str, Any] = Field(default_factory=dict)
    after: dict[str, Any] = Field(default_factory=dict)
    diff: dict[str, Any] = Field(default_factory=dict)


def _session_factory():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(status_code=503, detail="Training persistence requires sqlite or postgres database backend")
    return sf


async def _user_id(request: Request) -> str | None:
    return await get_current_user(request)


def _owner_filter(model: Any, user_id: str | None):
    return model.user_id.is_(None) if user_id is None else model.user_id == user_id


async def _get_role(session: Any, role_id: str, user_id: str | None) -> RoleProfileRow:
    row = (
        await session.execute(
            select(RoleProfileRow).where(
                RoleProfileRow.id == role_id,
                _owner_filter(RoleProfileRow, user_id),
                RoleProfileRow.status == "active",
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return row


async def _get_scenario(session: Any, scenario_id: str, user_id: str | None) -> ScenarioProfileRow:
    row = (
        await session.execute(
            select(ScenarioProfileRow).where(
                ScenarioProfileRow.id == scenario_id,
                _owner_filter(ScenarioProfileRow, user_id),
                ScenarioProfileRow.status == "active",
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return row


async def _get_session_row(session: Any, session_id: str, user_id: str | None) -> SimulationSessionRow:
    row = (
        await session.execute(
            select(SimulationSessionRow).where(
                SimulationSessionRow.id == session_id,
                _owner_filter(SimulationSessionRow, user_id),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return row


async def _messages_for_session(session: Any, session_id: str) -> list[SimulationMessageRow]:
    return list((await session.execute(select(SimulationMessageRow).where(SimulationMessageRow.session_id == session_id).order_by(SimulationMessageRow.turn_index.asc()))).scalars().all())


async def _generate_dialogue(
    *,
    speaker: SpeakerType,
    customer: RoleProfileRow,
    agent: RoleProfileRow,
    scenario: ScenarioProfileRow,
    messages: list[SimulationMessageRow],
) -> tuple[str, dict[str, Any]]:
    speaker_name = "客户 Agent" if speaker == "customer" else "代理人 Agent"
    transcript = [{"speaker": msg.speaker_type, "content": msg.content} for msg in messages[-10:]]
    fallback_text = "我想先了解一下具体情况。" if speaker == "customer" else "我先了解您的顾虑，再看是否有合适的保障思路。"
    fallback = {"content": fallback_text}
    payload = {
        "speaker": speaker,
        "customer_profile": _row_dict(customer),
        "agent_profile": _row_dict(agent),
        "scenario": _row_dict(scenario),
        "recent_messages": transcript,
    }
    parsed = await _invoke_json_agent(
        DIALOGUE_PROMPT.format(speaker_name=speaker_name) + '\n请输出 JSON：{"content":"一句对话"}',
        payload,
        fallback,
    )
    content = parsed.get("content")
    if not isinstance(content, str) or not content.strip():
        content = fallback_text
    return content.strip(), parsed


async def _next_turn(session_db: Any, session_row: SimulationSessionRow, user_id: str | None) -> SimulationMessageRow:
    customer = await _get_role(session_db, session_row.customer_role_id, user_id)
    agent = await _get_role(session_db, session_row.agent_role_id, user_id)
    scenario = await _get_scenario(session_db, session_row.scenario_id, user_id)
    messages = await _messages_for_session(session_db, session_row.id)
    speaker: SpeakerType = "customer" if len(messages) % 2 == 0 else "agent"
    content, raw = await _generate_dialogue(
        speaker=speaker,
        customer=customer,
        agent=agent,
        scenario=scenario,
        messages=messages,
    )
    message = SimulationMessageRow(
        id=_new_id("msg"),
        session_id=session_row.id,
        user_id=user_id,
        speaker_type=speaker,
        speaker_role_id=customer.id if speaker == "customer" else agent.id,
        content=content,
        turn_index=session_row.current_turn + 1,
        raw_response=raw,
    )
    session_db.add(message)
    session_row.status = "running"
    session_row.started_at = session_row.started_at or _now()
    session_row.current_turn += 1
    session_row.updated_at = _now()
    if session_row.current_turn >= session_row.max_turns:
        session_row.status = "ended"
        session_row.ended_at = _now()
    return message


@router.post("/roles/parse")
async def parse_role(body: ParseRoleRequest, request: Request) -> dict[str, Any]:
    get_config(request)
    return await _invoke_json_agent(
        ROLE_PARSE_PROMPT,
        body.model_dump(),
        _role_parse_fallback(body.role_type, body.name, body.description),
    )


@router.post("/roles")
async def create_role(body: RoleUpsertRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = RoleProfileRow(
            id=_new_id("role"),
            user_id=user_id,
            role_type=body.role_type,
            name=body.name,
            description=body.description,
            summary=body.summary,
            structured_profile=body.structured_profile,
            tags=body.tags,
            avatar_url=body.avatar_url,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _row_dict(row)


@router.get("/roles")
async def list_roles(request: Request, role_type: RoleType | None = None) -> list[dict[str, Any]]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        conditions = [_owner_filter(RoleProfileRow, user_id), RoleProfileRow.status == "active"]
        if role_type:
            conditions.append(RoleProfileRow.role_type == role_type)
        rows = (await session.execute(select(RoleProfileRow).where(*conditions).order_by(RoleProfileRow.updated_at.desc()))).scalars().all()
        return [_row_dict(row) for row in rows]


@router.get("/roles/{role_id}")
async def get_role(role_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        return _row_dict(await _get_role(session, role_id, user_id))


@router.put("/roles/{role_id}")
async def update_role(role_id: str, body: RoleUpsertRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_role(session, role_id, user_id)
        before = _row_dict(row)
        row.role_type = body.role_type
        row.name = body.name
        row.description = body.description
        row.summary = body.summary
        row.structured_profile = body.structured_profile
        row.tags = body.tags
        row.avatar_url = body.avatar_url
        row.version += 1
        row.updated_at = _now()
        session.add(
            ProfileRevisionRow(
                id=_new_id("rev"),
                role_id=row.id,
                user_id=user_id,
                change_type="manual_edit",
                before=before,
                after=_row_dict(row),
                diff={"manual_edit": True},
            )
        )
        await session.commit()
        await session.refresh(row)
        return _row_dict(row)


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, request: Request) -> dict[str, bool]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_role(session, role_id, user_id)
        row.status = "archived"
        row.updated_at = _now()
        await session.commit()
        return {"success": True}


@router.post("/scenarios/parse")
async def parse_scenario(body: ParseScenarioRequest, request: Request) -> dict[str, Any]:
    get_config(request)
    return await _invoke_json_agent(
        SCENARIO_PARSE_PROMPT,
        body.model_dump(),
        _scenario_parse_fallback(body.name, body.description),
    )


@router.post("/scenarios")
async def create_scenario(body: ScenarioUpsertRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = ScenarioProfileRow(user_id=user_id, id=_new_id("scenario"), **body.model_dump())
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _row_dict(row)


@router.get("/scenarios")
async def list_scenarios(request: Request) -> list[dict[str, Any]]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        rows = (await session.execute(select(ScenarioProfileRow).where(_owner_filter(ScenarioProfileRow, user_id), ScenarioProfileRow.status == "active").order_by(ScenarioProfileRow.updated_at.desc()))).scalars().all()
        return [_row_dict(row) for row in rows]


@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        return _row_dict(await _get_scenario(session, scenario_id, user_id))


@router.put("/scenarios/{scenario_id}")
async def update_scenario(scenario_id: str, body: ScenarioUpsertRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_scenario(session, scenario_id, user_id)
        for key, value in body.model_dump().items():
            setattr(row, key, value)
        row.updated_at = _now()
        await session.commit()
        await session.refresh(row)
        return _row_dict(row)


@router.delete("/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str, request: Request) -> dict[str, bool]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_scenario(session, scenario_id, user_id)
        row.status = "archived"
        row.updated_at = _now()
        await session.commit()
        return {"success": True}


@router.post("/simulations")
async def create_simulation(body: SimulationCreateRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        customer = await _get_role(session, body.customer_role_id, user_id)
        agent = await _get_role(session, body.agent_role_id, user_id)
        if customer.role_type != "customer" or agent.role_type != "agent":
            raise HTTPException(status_code=400, detail="Please choose one customer role and one agent role")
        await _get_scenario(session, body.scenario_id, user_id)
        row = SimulationSessionRow(
            id=_new_id("sim"),
            user_id=user_id,
            customer_role_id=body.customer_role_id,
            agent_role_id=body.agent_role_id,
            scenario_id=body.scenario_id,
            max_turns=body.max_turns,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _row_dict(row)


@router.get("/simulations")
async def list_simulations(request: Request) -> list[dict[str, Any]]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        rows = (await session.execute(select(SimulationSessionRow).where(_owner_filter(SimulationSessionRow, user_id)).order_by(SimulationSessionRow.updated_at.desc()).limit(30))).scalars().all()
        return [_row_dict(row) for row in rows]


@router.get("/simulations/{session_id}")
async def get_simulation(session_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_session_row(session, session_id, user_id)
        messages = await _messages_for_session(session, session_id)
        reports = (await session.execute(select(ReviewReportRow).where(ReviewReportRow.session_id == session_id, _owner_filter(ReviewReportRow, user_id)).order_by(ReviewReportRow.created_at.desc()))).scalars().all()
        return {
            **_row_dict(row),
            "messages": [_row_dict(message) for message in messages],
            "reports": [_row_dict(report) for report in reports],
        }


@router.get("/simulations/{session_id}/messages")
async def get_simulation_messages(session_id: str, request: Request) -> list[dict[str, Any]]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        await _get_session_row(session, session_id, user_id)
        return [_row_dict(message) for message in await _messages_for_session(session, session_id)]


@router.post("/simulations/{session_id}/next-turn")
async def next_turn(session_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_session_row(session, session_id, user_id)
        if row.status in {"ended", "completed"}:
            raise HTTPException(status_code=400, detail="Simulation is already ended")
        message = await _next_turn(session, row, user_id)
        await session.commit()
        await session.refresh(row)
        return {"message": _row_dict(message), "session_status": row.status, "session": _row_dict(row)}


@router.post("/simulations/{session_id}/run")
async def run_simulation(session_id: str, body: SimulationRunRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_session_row(session, session_id, user_id)
        while row.current_turn < row.max_turns and row.status not in {"ended", "completed"}:
            await _next_turn(session, row, user_id)
            await session.flush()
        row.status = "ended"
        row.ended_at = row.ended_at or _now()
        row.updated_at = _now()
        await session.commit()
        await session.refresh(row)
        messages = await _messages_for_session(session, session_id)
        return {"session_id": row.id, "status": row.status, "messages": [_row_dict(message) for message in messages]}


@router.post("/simulations/{session_id}/review")
async def create_review(session_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = await _get_session_row(session, session_id, user_id)
        customer = await _get_role(session, row.customer_role_id, user_id)
        agent = await _get_role(session, row.agent_role_id, user_id)
        scenario = await _get_scenario(session, row.scenario_id, user_id)
        messages = await _messages_for_session(session, session_id)
        if not messages:
            raise HTTPException(status_code=400, detail="Simulation has no messages")
        fallback = {
            "summary": "本次对练已完成，请结合对话内容继续优化需求挖掘和异议处理。",
            "report": {
                "scores": {"need_discovery": 3, "trust_building": 3, "empathy": 3, "product_explanation": 3, "objection_handling": 3, "closing": 3, "compliance": 4, "overall": 3},
                "strengths": [],
                "weaknesses": [],
                "customer_reactions": [],
                "good_phrases": [],
                "bad_phrases": [],
                "next_training_advice": ["下一轮训练重点观察客户异议，并先确认需求再介绍方案。"],
                "compliance_risks": [],
            },
            "customer_profile_suggestions": {},
            "agent_profile_upgrade_suggestions": {},
        }
        parsed = await _invoke_json_agent(
            REVIEW_PROMPT,
            {
                "customer_profile": _row_dict(customer),
                "agent_profile": _row_dict(agent),
                "scenario": _row_dict(scenario),
                "messages": [_row_dict(message) for message in messages],
            },
            fallback,
        )
        report = ReviewReportRow(
            id=_new_id("report"),
            user_id=user_id,
            session_id=session_id,
            summary=str(parsed.get("summary") or fallback["summary"]),
            report=parsed.get("report") if isinstance(parsed.get("report"), dict) else fallback["report"],
            customer_profile_suggestions=parsed.get("customer_profile_suggestions") if isinstance(parsed.get("customer_profile_suggestions"), dict) else {},
            agent_profile_upgrade_suggestions=parsed.get("agent_profile_upgrade_suggestions") if isinstance(parsed.get("agent_profile_upgrade_suggestions"), dict) else {},
        )
        row.status = "completed"
        row.summary = report.summary
        row.updated_at = _now()
        session.add(report)
        await session.commit()
        await session.refresh(report)
        return _row_dict(report)


@router.get("/reports/{report_id}")
async def get_report(report_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        row = (await session.execute(select(ReviewReportRow).where(ReviewReportRow.id == report_id, _owner_filter(ReviewReportRow, user_id)))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Report not found")
        return _row_dict(row)


@router.get("/simulations/{session_id}/review")
async def get_latest_review(session_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        await _get_session_row(session, session_id, user_id)
        row = (await session.execute(select(ReviewReportRow).where(ReviewReportRow.session_id == session_id, _owner_filter(ReviewReportRow, user_id)).order_by(ReviewReportRow.created_at.desc()))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Report not found")
        return _row_dict(row)


def _merge_profile(role: RoleProfileRow, suggestions: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    before = {
        "summary": role.summary,
        "structured_profile": role.structured_profile,
        "tags": role.tags,
    }
    suggested_tags = suggestions.get("tags") if isinstance(suggestions.get("tags"), list) else []
    after_tags = list(dict.fromkeys([*role.tags, *[str(tag) for tag in suggested_tags]]))
    suggested_profile = suggestions.get("structured_profile") if isinstance(suggestions.get("structured_profile"), dict) else suggestions
    after_profile = {**(role.structured_profile or {}), **(suggested_profile or {})}
    after = {
        "summary": str(suggestions.get("summary") or role.summary),
        "structured_profile": after_profile,
        "tags": after_tags,
    }
    diff = {
        "summary_changed": before["summary"] != after["summary"],
        "added_tags": [tag for tag in after_tags if tag not in role.tags],
        "suggestion_keys": list((suggested_profile or {}).keys()),
    }
    return before, after, diff


@router.post("/reports/{report_id}/revision-preview")
async def revision_preview(report_id: str, body: RevisionPreviewRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        report = (await session.execute(select(ReviewReportRow).where(ReviewReportRow.id == report_id, _owner_filter(ReviewReportRow, user_id)))).scalar_one_or_none()
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")
        role = await _get_role(session, body.role_id, user_id)
        suggestions = report.customer_profile_suggestions if body.revision_type == "customer_refinement" else report.agent_profile_upgrade_suggestions
        before, after, diff = _merge_profile(role, suggestions or {})
        return {
            "role_id": role.id,
            "before": before,
            "after": after,
            "diff": diff,
            "change_reason": "根据本次复盘报告建议补充画像，等待用户确认应用。",
        }


@router.post("/profile-revisions")
async def apply_profile_revision(body: RevisionApplyRequest, request: Request) -> dict[str, Any]:
    user_id = await _user_id(request)
    async with _session_factory()() as session:
        role = await _get_role(session, body.role_id, user_id)
        role.summary = str(body.after.get("summary") or role.summary)
        if isinstance(body.after.get("structured_profile"), dict):
            role.structured_profile = body.after["structured_profile"]
        if isinstance(body.after.get("tags"), list):
            role.tags = [str(tag) for tag in body.after["tags"]]
        role.version += 1
        role.updated_at = _now()
        revision = ProfileRevisionRow(
            id=_new_id("rev"),
            role_id=role.id,
            user_id=user_id,
            source_session_id=body.source_session_id,
            source_report_id=body.source_report_id,
            change_type=body.change_type,
            before=body.before,
            after=body.after,
            diff=body.diff,
            applied_by_user=True,
        )
        session.add(revision)
        await session.commit()
        await session.refresh(role)
        await session.refresh(revision)
        return {"revision_id": revision.id, "role_id": role.id, "new_version": role.version}
