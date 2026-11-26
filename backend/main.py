"""FastAPI service exposing the crossword generator.

Run locally with:
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from supabase import Client, create_client

from crossword_generator import CrosswordError, CrosswordGenerator


class ClueInput(BaseModel):
    number: int = Field(gt=0)
    clue: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=100)


class GenerateRequest(BaseModel):
    size: int = Field(default=11, ge=2, le=50)
    across: list[ClueInput] = Field(default_factory=list)
    down: list[ClueInput] = Field(default_factory=list)


class RoomRequest(BaseModel):
    puzzle: dict
    title: str = Field(default="Cruci cuando quieras", min_length=1, max_length=100)
    display_name: str = Field(default="Jugador", min_length=1, max_length=32)


class JoinRequest(BaseModel):
    display_name: str = Field(default="Jugador", min_length=1, max_length=32)


class CompleteWordRequest(BaseModel):
    direction: str
    clue_number: int = Field(gt=0)
    answer: str = Field(min_length=1, max_length=100)


app = FastAPI(
    title="Crucigrama Generator API",
    version="0.1.0",
    description="Generates a playable crossword board from across and down clues.",
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/generate")
def generate_crossword(request: GenerateRequest) -> dict:
    try:
        generator = CrosswordGenerator.from_payload(
            request.model_dump(), max_nodes=1_000_000
        )
        return generator.generate(timeout_seconds=10)
    except CrosswordError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


def supabase_admin() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Las salas todavía no están configuradas.")
    return create_client(url, key)


def require_user(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Iniciá la sala antes de continuar.")
    token = authorization.removeprefix("Bearer ")
    try:
        response = supabase_admin().auth.get_user(token)
        user = response.user
    except Exception as error:
        raise HTTPException(status_code=401, detail="La sesión no es válida.") from error
    if not user:
        raise HTTPException(status_code=401, detail="La sesión no es válida.")
    return str(user.id)


def room_slug() -> str:
    return secrets.token_urlsafe(6).replace("-", "A").replace("_", "B")[:8]


def public_puzzle(puzzle: dict) -> tuple[dict, dict]:
    grid = puzzle.get("grid")
    if not isinstance(grid, list) or not grid:
        raise HTTPException(status_code=400, detail="El crucigrama no es válido.")
    public_grid: list[list[dict]] = []
    solution_grid: list[list[str | None]] = []
    for row in grid:
        if not isinstance(row, list):
            raise HTTPException(status_code=400, detail="El crucigrama no es válido.")
        public_row: list[dict] = []
        solution_row: list[str | None] = []
        for cell in row:
            if not isinstance(cell, dict):
                raise HTTPException(status_code=400, detail="El crucigrama no es válido.")
            public_row.append({**cell, "letter": None})
            solution_row.append(cell.get("letter"))
        public_grid.append(public_row)
        solution_grid.append(solution_row)
    return {**puzzle, "grid": public_grid}, {"grid": solution_grid}


def player_for_room(client: Client, room_id: str, user_id: str, display_name: str) -> dict:
    existing = client.table("crossword_players").select("*").eq("room_id", room_id).eq("user_id", user_id).execute().data
    if existing:
        return existing[0]
    return client.table("crossword_players").insert({"room_id": room_id, "user_id": user_id, "display_name": display_name.strip()}).execute().data[0]


def room_by_slug(client: Client, slug: str) -> dict:
    rooms = client.table("crossword_rooms").select("*").eq("slug", slug).execute().data
    if not rooms:
        raise HTTPException(status_code=404, detail="No encontramos esta sala.")
    return rooms[0]


@app.post("/api/rooms")
def create_room(request: RoomRequest, authorization: str | None = Header(default=None)) -> dict:
    user_id = require_user(authorization)
    client = supabase_admin()
    public, solution = public_puzzle(request.puzzle)
    for _ in range(3):
        slug = room_slug()
        try:
            room = client.table("crossword_rooms").insert({
                "slug": slug,
                "title": request.title.strip(),
                "grid_size": public.get("size"),
                "puzzle": public,
            }).execute().data[0]
            break
        except Exception:
            continue
    else:
        raise HTTPException(status_code=503, detail="No se pudo crear la sala. Probá otra vez.")
    client.table("crossword_room_solutions").insert({"room_id": room["id"], "solution": solution}).execute()
    player = player_for_room(client, room["id"], user_id, request.display_name)
    return {"room": room, "player": player, "join_url": f"/?room={room['slug']}"}


@app.post("/api/rooms/{slug}/join")
def join_room(slug: str, request: JoinRequest, authorization: str | None = Header(default=None)) -> dict:
    user_id = require_user(authorization)
    client = supabase_admin()
    room = room_by_slug(client, slug)
    player = player_for_room(client, room["id"], user_id, request.display_name)
    return {"room": room, "player": player}


@app.get("/api/rooms/{slug}/progress")
def room_progress(slug: str, authorization: str | None = Header(default=None)) -> dict:
    user_id = require_user(authorization)
    client = supabase_admin()
    room = room_by_slug(client, slug)
    player_for_room(client, room["id"], user_id, "Jugador")
    players = client.table("crossword_players").select("*").eq("room_id", room["id"]).execute().data
    completions = client.table("crossword_word_completions").select("player_id").eq("room_id", room["id"]).execute().data
    counts: dict[str, int] = {}
    for completion in completions:
        counts[completion["player_id"]] = counts.get(completion["player_id"], 0) + 1
    now = datetime.now(timezone.utc)
    def elapsed(player: dict) -> int | None:
        if not player.get("started_at"):
            return None
        started = datetime.fromisoformat(player["started_at"].replace("Z", "+00:00"))
        finished_at = player.get("finished_at")
        ended = datetime.fromisoformat(finished_at.replace("Z", "+00:00")) if finished_at else now
        return max(0, int((ended - started).total_seconds()))
    return {"players": [{**player, "solved_count": counts.get(player["id"], 0), "elapsed_seconds": elapsed(player)} for player in players]}


@app.post("/api/rooms/{slug}/start")
def start_room(slug: str, authorization: str | None = Header(default=None)) -> dict:
    user_id = require_user(authorization)
    client = supabase_admin()
    room = room_by_slug(client, slug)
    player = player_for_room(client, room["id"], user_id, "Jugador")
    if not player.get("started_at"):
        player = client.table("crossword_players").update({"started_at": datetime.now(timezone.utc).isoformat()}).eq("id", player["id"]).execute().data[0]
    return {"player": player}


@app.post("/api/rooms/{slug}/complete")
def complete_word(slug: str, request: CompleteWordRequest, authorization: str | None = Header(default=None)) -> dict:
    user_id = require_user(authorization)
    client = supabase_admin()
    room = room_by_slug(client, slug)
    player = player_for_room(client, room["id"], user_id, "Jugador")
    placements = room["puzzle"].get("placements", {})
    placement = placements.get(f"{request.direction}:{request.clue_number}")
    solution = client.table("crossword_room_solutions").select("solution").eq("room_id", room["id"]).single().execute().data["solution"]["grid"]
    if not placement or request.direction not in {"across", "down"}:
        raise HTTPException(status_code=400, detail="La palabra no existe.")
    row, col = placement["row"], placement["col"]
    step_row, step_col = (1, 0) if request.direction == "down" else (0, 1)
    letters: list[str] = []
    while 0 <= row < len(solution) and 0 <= col < len(solution[row]) and solution[row][col]:
        letters.append(solution[row][col])
        row += step_row
        col += step_col
    answer = request.answer.upper().replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
    expected = "".join(letters).upper().replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
    if answer != expected:
        return {"correct": False}
    client.table("crossword_word_completions").upsert({
        "room_id": room["id"], "player_id": player["id"], "direction": request.direction, "clue_number": request.clue_number,
    }, on_conflict="player_id,direction,clue_number").execute()
    completed = client.table("crossword_word_completions").select("clue_number", count="exact").eq("player_id", player["id"]).execute()
    total_words = len(placements)
    finished_at = None
    if completed.count >= total_words:
        finished_at = datetime.now(timezone.utc).isoformat()
        client.table("crossword_players").update({"finished_at": finished_at}).eq("id", player["id"]).is_("finished_at", "null").execute()
    return {"correct": True, "completed_at": datetime.now(timezone.utc).isoformat(), "finished_at": finished_at}
