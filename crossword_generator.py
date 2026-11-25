"""Local constraint solver for fixed-size crossword construction.

Input is JSON with `across` and `down` arrays. Each entry has `number`,
`clue`, and `answer`. Answers are retained in their original form but are
normalized for the grid (uppercase, no accents or punctuation).
"""

from __future__ import annotations

import argparse
import json
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

Direction = Literal["across", "down"]
Cell = tuple[int, int]


def normalize_answer(answer: str) -> str:
    decomposed = unicodedata.normalize("NFD", answer.upper())
    return "".join(
        char
        for char in decomposed
        if unicodedata.category(char) != "Mn" and char.isalpha()
    )


@dataclass(frozen=True)
class Entry:
    number: int
    clue: str
    answer: str
    grid_answer: str
    direction: Direction

    @property
    def id(self) -> str:
        return f"{self.direction}:{self.number}"


@dataclass(frozen=True)
class Placement:
    entry_id: str
    row: int
    col: int
    direction: Direction


@dataclass
class GridCell:
    letter: str | None = None
    across: str | None = None
    down: str | None = None


class CrosswordError(ValueError):
    pass


class CrosswordGenerator:
    """DFS + MRV crossword constructor with forward checking.

    This solver deliberately keeps dependencies to the Python standard library so
    it can be benchmarked locally before being exposed through an API.
    """

    def __init__(
        self,
        entries: list[Entry],
        size: int = 11,
        max_nodes: int = 200_000,
    ):
        self.entries = {entry.id: entry for entry in entries}
        self.size = size
        self.max_nodes = max_nodes
        self.nodes = 0
        self.placed: dict[str, Placement] = {}
        self.grid = [[GridCell() for _ in range(size)] for _ in range(size)]
        self.block_counts: dict[Cell, int] = {}
        self._validate_input()
        self.compatibility = self._build_compatibility_index()

    @classmethod
    def from_payload(cls, payload: dict[str, Any], **kwargs: Any) -> "CrosswordGenerator":
        entries: list[Entry] = []
        for direction in ("across", "down"):
            for raw in payload.get(direction, []):
                answer = str(raw["answer"]).strip()
                grid_answer = normalize_answer(answer)
                entries.append(
                    Entry(
                        number=int(raw["number"]),
                        clue=str(raw["clue"]).strip(),
                        answer=answer,
                        grid_answer=grid_answer,
                        direction=direction,
                    )
                )
        size = int(kwargs.pop("size", payload.get("size", 11)))
        return cls(entries, size=size, **kwargs)

    def _validate_input(self) -> None:
        if self.size < 2:
            raise CrosswordError("Grid size must be at least 2")
        seen: set[tuple[Direction, int]] = set()
        by_number: dict[int, dict[Direction, Entry]] = {}
        for entry in self.entries.values():
            key = (entry.direction, entry.number)
            if key in seen:
                raise CrosswordError(f"Duplicate {entry.direction} number: {entry.number}")
            seen.add(key)
            if not entry.grid_answer:
                raise CrosswordError(f"Entry {entry.id} has no usable letters")
            if len(entry.grid_answer) > self.size:
                raise CrosswordError(f"Entry {entry.id} exceeds the {self.size}x{self.size} grid")
            by_number.setdefault(entry.number, {})[entry.direction] = entry

        for number, pair in by_number.items():
            across, down = pair.get("across"), pair.get("down")
            if across and down and across.grid_answer[0] != down.grid_answer[0]:
                raise CrosswordError(
                    f"Entries sharing number {number} must share their first letter"
                )

    def _build_compatibility_index(self) -> dict[tuple[str, str], list[tuple[int, int]]]:
        index: dict[tuple[str, str], list[tuple[int, int]]] = {}
        across_entries = [entry for entry in self.entries.values() if entry.direction == "across"]
        down_entries = [entry for entry in self.entries.values() if entry.direction == "down"]
        for across in across_entries:
            for down in down_entries:
                positions = [
                    (a_pos, d_pos)
                    for a_pos, a_letter in enumerate(across.grid_answer)
                    for d_pos, d_letter in enumerate(down.grid_answer)
                    if a_letter == d_letter
                ]
                if across.number == down.number:
                    positions = [(0, 0)] if positions and (0, 0) in positions else []
                if positions:
                    index[(across.id, down.id)] = positions
        return index

    def _cells(self, entry: Entry, placement: Placement) -> list[tuple[Cell, str]]:
        delta = (0, 1) if entry.direction == "across" else (1, 0)
        return [
            ((placement.row + delta[0] * offset, placement.col + delta[1] * offset), letter)
            for offset, letter in enumerate(entry.grid_answer)
        ]

    def _in_bounds(self, row: int, col: int) -> bool:
        return 0 <= row < self.size and 0 <= col < self.size

    def _is_blocked(self, row: int, col: int) -> bool:
        return (row, col) in self.block_counts

    def _row_major_position(self, placement: Placement) -> int:
        return placement.row * self.size + placement.col

    def _counterpart(self, entry: Entry) -> Entry | None:
        direction: Direction = "down" if entry.direction == "across" else "across"
        return self.entries.get(f"{direction}:{entry.number}")

    def _boundary_cells(self, entry: Entry, placement: Placement) -> tuple[Cell, Cell]:
        if entry.direction == "across":
            return (placement.row, placement.col - 1), (placement.row, placement.col + len(entry.grid_answer))
        return (placement.row - 1, placement.col), (placement.row + len(entry.grid_answer), placement.col)

    def _candidate_placements(self, entry: Entry) -> list[Placement]:
        counterpart = self._counterpart(entry)
        anchor = self.placed.get(counterpart.id) if counterpart else None
        if anchor:
            starts = [(anchor.row, anchor.col)]
        else:
            limit = self.size - len(entry.grid_answer) + 1
            starts = [(row, col) for row in range(self.size) for col in range(self.size)
                      if (entry.direction == "across" and col < limit)
                      or (entry.direction == "down" and row < limit)]
        candidates = [Placement(entry.id, row, col, entry.direction) for row, col in starts]
        return [placement for placement in candidates if self._can_place(entry, placement)]

    def _can_place(self, entry: Entry, placement: Placement) -> bool:
        position = self._row_major_position(placement)
        for other_id, other in self.placed.items():
            other_number = self.entries[other_id].number
            other_position = self._row_major_position(other)
            if entry.number < other_number and position >= other_position:
                return False
            if entry.number > other_number and position <= other_position:
                return False

        start_before, end_after = self._boundary_cells(entry, placement)
        for boundary in (start_before, end_after):
            if self._in_bounds(*boundary):
                if self.grid[boundary[0]][boundary[1]].letter is not None:
                    return False

        crosses = 0
        for (row, col), letter in self._cells(entry, placement):
            if not self._in_bounds(row, col) or self._is_blocked(row, col):
                return False
            cell = self.grid[row][col]
            same_direction = cell.across if entry.direction == "across" else cell.down
            if same_direction is not None:
                return False
            if cell.letter is not None:
                if cell.letter != letter:
                    return False
                crosses += 1

        counterpart = self._counterpart(entry)
        if counterpart and counterpart.id in self.placed:
            other = self.placed[counterpart.id]
            if (placement.row, placement.col) != (other.row, other.col):
                return False

        # The first half of a shared-number pair may be placed before its
        # counterpart; that counterpart is forced to cross at the same start.
        # All other later entries must connect to the existing board.
        return not self.placed or crosses > 0 or (counterpart is not None and counterpart.id not in self.placed)

    def _place(self, entry: Entry, placement: Placement) -> tuple[list[Cell], list[Cell]]:
        changed_cells: list[Cell] = []
        added_blocks: list[Cell] = []
        for (row, col), letter in self._cells(entry, placement):
            cell = self.grid[row][col]
            if cell.letter is None:
                changed_cells.append((row, col))
                cell.letter = letter
            if entry.direction == "across":
                cell.across = entry.id
            else:
                cell.down = entry.id

        for boundary in self._boundary_cells(entry, placement):
            if self._in_bounds(*boundary):
                self.block_counts[boundary] = self.block_counts.get(boundary, 0) + 1
                added_blocks.append(boundary)
        self.placed[entry.id] = placement
        return changed_cells, added_blocks

    def _unplace(self, entry: Entry, changed_cells: list[Cell], added_blocks: list[Cell]) -> None:
        placement = self.placed.pop(entry.id)
        for (row, col), _ in self._cells(entry, placement):
            cell = self.grid[row][col]
            if entry.direction == "across":
                cell.across = None
            else:
                cell.down = None
        for row, col in changed_cells:
            cell = self.grid[row][col]
            if cell.across is None and cell.down is None:
                cell.letter = None
        for block in added_blocks:
            remaining = self.block_counts[block] - 1
            if remaining:
                self.block_counts[block] = remaining
            else:
                del self.block_counts[block]

    def _select_entry(self) -> tuple[Entry, list[Placement]] | None:
        options: list[tuple[int, int, Entry, list[Placement]]] = []
        for entry in self.entries.values():
            if entry.id in self.placed:
                continue
            candidates = self._candidate_placements(entry)
            degree = sum(1 for key in self.compatibility if entry.id in key)
            options.append((len(candidates), -degree, entry, candidates))
        if not options:
            return None
        _, _, entry, candidates = min(
            options,
            key=lambda option: (
                option[2].number,
                option[0],
                option[1],
                -len(option[2].grid_answer),
            ),
        )
        return entry, candidates

    def _search(self, deadline: float) -> bool:
        if time.monotonic() >= deadline or self.nodes >= self.max_nodes:
            return False
        selected = self._select_entry()
        if selected is None:
            return True
        entry, candidates = selected
        if not candidates:
            return False

        # Prefer crossings that connect the candidate to the most existing letters.
        candidates.sort(key=lambda candidate: sum(
            self.grid[row][col].letter is not None for (row, col), _ in self._cells(entry, candidate)
        ), reverse=True)
        for candidate in candidates:
            self.nodes += 1
            changed_cells, added_blocks = self._place(entry, candidate)
            if self._search(deadline):
                return True
            self._unplace(entry, changed_cells, added_blocks)
        return False

    def generate(self, timeout_seconds: float = 5.0) -> dict[str, Any]:
        if timeout_seconds <= 0:
            raise CrosswordError("timeout_seconds must be positive")
        if not self._search(time.monotonic() + timeout_seconds):
            raise CrosswordError("No valid board found within the configured search budget")
        return self.to_dict()

    def to_dict(self) -> dict[str, Any]:
        rows: list[list[dict[str, Any]]] = []
        for row_index, row in enumerate(self.grid):
            rows.append([
                {
                    "blocked": cell.letter is None,
                    "letter": cell.letter,
                    "number": self._cell_number(row_index, col_index),
                }
                for col_index, cell in enumerate(row)
            ])
        return {
            "size": self.size,
            "nodes": self.nodes,
            "grid": rows,
            "placements": {
                entry_id: {"row": placement.row, "col": placement.col, "direction": placement.direction}
                for entry_id, placement in self.placed.items()
            },
            "clues": [
                {"number": entry.number, "direction": entry.direction, "clue": entry.clue}
                for entry in sorted(self.entries.values(), key=lambda item: (item.direction, item.number))
            ],
        }

    def _cell_number(self, row: int, col: int) -> int | None:
        starts = [
            self.entries[entry_id].number
            for entry_id, placement in self.placed.items()
            if (placement.row, placement.col) == (row, col)
        ]
        return min(starts) if starts else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an 11x11 crossword from JSON input.")
    parser.add_argument("input", type=Path, help="Path to a puzzle JSON file")
    parser.add_argument("--output", type=Path, help="Optional path for generated JSON")
    parser.add_argument("--timeout", type=float, default=5.0, help="Search time budget in seconds")
    parser.add_argument("--max-nodes", type=int, default=200_000, help="Maximum DFS nodes")
    parser.add_argument("--size", type=int, help="Override the grid size declared in input JSON")
    args = parser.parse_args()

    generator_kwargs: dict[str, Any] = {"max_nodes": args.max_nodes}
    if args.size is not None:
        generator_kwargs["size"] = args.size
    generator = CrosswordGenerator.from_payload(
        json.loads(args.input.read_text(encoding="utf-8")),
        **generator_kwargs,
    )
    result = generator.generate(timeout_seconds=args.timeout)
    encoded = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(encoded + "\n", encoding="utf-8")
    else:
        print(encoded)


if __name__ == "__main__":
    main()
