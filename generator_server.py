"""FastAPI service exposing the crossword generator.

Run locally with:
    python -m uvicorn generator_server:app --host 127.0.0.1 --port 8000 --reload
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from crossword_generator import CrosswordError, CrosswordGenerator


class ClueInput(BaseModel):
    number: int = Field(gt=0)
    clue: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=100)


class GenerateRequest(BaseModel):
    size: int = Field(default=11, ge=2, le=50)
    across: list[ClueInput] = Field(default_factory=list)
    down: list[ClueInput] = Field(default_factory=list)


app = FastAPI(
    title="Crucigrama Generator API",
    version="0.1.0",
    description="Generates a playable crossword board from across and down clues.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate")
def generate_crossword(request: GenerateRequest) -> dict:
    try:
        generator = CrosswordGenerator.from_payload(
            request.model_dump(), max_nodes=1_000_000
        )
        return generator.generate(timeout_seconds=10)
    except CrosswordError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
