"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Direction = "across" | "down";
type Cell = { row: number; col: number };
type GridCell = { blocked: boolean; letter: string | null; number: number | null };
type Puzzle = {
  size: number;
  grid: GridCell[][];
  clues: { number: number; direction: Direction; clue: string }[];
  placements?: Record<string, { row: number; col: number; direction: Direction }>;
};
type Word = { id: string; number: number; direction: Direction; cells: Cell[] };

const demoRows = [
  "#BOBBY##GPS",
  "JUPITER#OLI",
  "ARIO#NEGRAS",
  "RINGO#AORTA",
  "ALARME#NAO#",
  "###ASPID###",
  "#PUF#ADOSAR",
  "CASIO#ALABE",
  "IGUANA#ELAM",
  "MAR#ULTRAJE",
  "ASA##OZONO#",
];

const demoClues = {
  across: [
    [1, "Apodo del legendario Fischer del tablero."],
    [6, "Brújula digital del siglo XXI."],
    [9, "Quinto desde el Sol, pero el más grande."],
    [13, "Oscuras como la noche."],
    [25, "Arrimar una cosa a otra."],
    [36, "Ofensa imperdonable."],
  ],
  down: [
    [1, "Cincel para metales."],
    [2, "Expresa su punto de vista."],
    [3, "Retrato literario de alguien."],
    [6, "Sombrero de visera."],
    [14, "Barquero veneciano."],
    [29, "El sueño de todo escalador."],
  ],
} as const;

const starterAcross = `1 | Apodo del legendario Fischer del tablero. | BOBBY
6 | Brújula digital del siglo XXI. | GPS
9 | Quinto desde el Sol, pero el más grande. | JÚPITER
11 | Capté un olor. | OLÍ
12 | Componente de palabras como 'bibliotecario'. | ARIO
13 | Oscuras como la noche. | NEGRAS
15 | Beatle de los tambores. | RINGO
17 | La reina de las arterias. | AORTA
18 | Genere inquietud o sobresalto. | ALARME
20 | Nave antigua. | NAO
21 | Víbora venenosa legendaria. | ÁSPID
23 | Asiento blando sin respaldo. | PUF
25 | Arrimar una cosa a otra. | ADOSAR
29 | Marca japonesa de relojes y calculadoras. | CASIO
31 | Elogie fervorosamente. | ALABE
32 | Mascota exótica de sangre fría. | IGUANA
34 | Vecino histórico de Babilonia. | ELAM
35 | Mediterráneo o Egeo. | MAR
36 | Ofensa imperdonable. | ULTRAJE
38 | Agarradera de una taza. | ASA
39 | Capa protectora en la atmósfera. | OZONO`;

const starterDown = `1 | Cincel para metales. | BURIL
2 | Expresa su punto de vista. | OPINA
3 | Retrato literario de alguien. | BIOGRAFÍA
4 | Bután en internet. | BT
5 | Símbolo económico nipón. | YEN
6 | Sombrero de visera. | GORRA
7 | Soporte culinario imprescindible. | PLATO
8 | Cierto corte de una prenda. | SISA
9 | Víctor __, cantautor popular chileno. | JARA
10 | Madre de Poseidón y Zeus. | REA
14 | Barquero veneciano. | GONDOLERO
16 | Organización Mundial de la Salud. | OMS
19 | Exclamación de sorpresa. | EPA
22 | Despistada, distraída. | IDA
23 | Liquidas tus deudas. | PAGAS
24 | Préstamo con interés exorbitante. | USURA
26 | Sazonan. | SALAN
27 | En lugar o parte inferior. | ABAJO
28 | Impulse la barca. | REME
29 | El sueño de todo escalador. | CIMA
30 | Organización con sede en la Gran Manzana. | ONU
33 | Saludo telefónico. | ALO-
37 | Tanzania, en internet. | TZ`;

function keyOf(cell: Cell) {
  return `${cell.row}-${cell.col}`;
}

function buildDemoPuzzle(): Puzzle {
  const numbers = new Map<string, number>();
  let number = 1;
  for (let row = 0; row < demoRows.length; row += 1) {
    for (let col = 0; col < demoRows[row].length; col += 1) {
      const open = (checkRow: number, checkCol: number) => Boolean(demoRows[checkRow]) && demoRows[checkRow][checkCol] !== "#";
      if (!open(row, col)) continue;
      const startsAcross = (col === 0 || !open(row, col - 1)) && col + 1 < demoRows[row].length && open(row, col + 1);
      const startsDown = (row === 0 || !open(row - 1, col)) && row + 1 < demoRows.length && open(row + 1, col);
      if (startsAcross || startsDown) numbers.set(keyOf({ row, col }), number++);
    }
  }
  return {
    size: demoRows.length,
    grid: demoRows.map((row, rowIndex) => row.split("").map((letter, colIndex) => ({
      blocked: letter === "#",
      letter: letter === "#" ? null : letter,
      number: numbers.get(keyOf({ row: rowIndex, col: colIndex })) ?? null,
    }))),
    clues: [
      ...demoClues.across.map(([number, clue]) => ({ number, clue, direction: "across" as const })),
      ...demoClues.down.map(([number, clue]) => ({ number, clue, direction: "down" as const })),
    ],
  };
}

const demoPuzzle = buildDemoPuzzle();

function isOpen(grid: GridCell[][], row: number, col: number) {
  return Boolean(grid[row]?.[col]) && !grid[row][col].blocked;
}

function parseEntries(source: string, direction: Direction) {
  return source
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length === 3 && Number(parts[0]))
    .map(([number, clue, answer]) => ({ number: Number(number), clue, answer, direction }));
}

function wordsFromPuzzle(puzzle: Puzzle): Word[] {
  if (puzzle.placements) {
    return Object.entries(puzzle.placements)
      .map(([entryId, placement]) => {
        const [direction, rawNumber] = entryId.split(":") as [Direction, string];
        const rowStep = placement.direction === "down" ? 1 : 0;
        const colStep = placement.direction === "across" ? 1 : 0;
        const cells: Cell[] = [];
        let row = placement.row;
        let col = placement.col;
        while (isOpen(puzzle.grid, row, col)) {
          cells.push({ row, col });
          row += rowStep;
          col += colStep;
        }
        return { id: entryId, number: Number(rawNumber), direction: placement.direction, cells };
      })
      .sort((left, right) => left.number - right.number || left.direction.localeCompare(right.direction));
  }

  const clues = new Set(puzzle.clues.map((clue) => `${clue.direction}-${clue.number}`));
  const words: Word[] = [];
  for (let row = 0; row < puzzle.size; row += 1) {
    for (let col = 0; col < puzzle.size; col += 1) {
      const number = puzzle.grid[row][col]?.number;
      if (!number) continue;
      (["across", "down"] as const).forEach((direction) => {
        if (!clues.has(`${direction}-${number}`)) return;
        const rowStep = direction === "down" ? 1 : 0;
        const colStep = direction === "across" ? 1 : 0;
        const cells: Cell[] = [];
        let currentRow = row;
        let currentCol = col;
        while (isOpen(puzzle.grid, currentRow, currentCol)) {
          cells.push({ row: currentRow, col: currentCol });
          currentRow += rowStep;
          currentCol += colStep;
        }
        if (cells.length) words.push({ id: `${direction}:${number}`, number, direction, cells });
      });
    }
  }
  return words.sort((left, right) => left.number - right.number || left.direction.localeCompare(right.direction));
}

export default function Home() {
  const [screen, setScreen] = useState<"create" | "play">("create");
  const [size, setSize] = useState(11);
  const [across, setAcross] = useState(starterAcross);
  const [down, setDown] = useState(starterDown);
  const [active, setActive] = useState<Cell>({ row: 0, col: 1 });
  const [direction, setDirection] = useState<Direction>("across");
  const [activeWordId, setActiveWordId] = useState<string>();
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [status, setStatus] = useState("");
  const [puzzle, setPuzzle] = useState<Puzzle>(demoPuzzle);
  const gameRef = useRef<HTMLElement>(null);
  const previousSolvedWords = useRef<Set<string>>(new Set());
  const words = useMemo(() => wordsFromPuzzle(puzzle), [puzzle]);
  const clues = useMemo(() => ({
    across: puzzle.clues.filter((clue) => clue.direction === "across").map(({ number, clue }) => [number, clue] as const),
    down: puzzle.clues.filter((clue) => clue.direction === "down").map(({ number, clue }) => [number, clue] as const),
  }), [puzzle]);

  const activeWord = useMemo(
    () => words.find((word) => word.id === activeWordId) ?? words.find((word) => word.direction === direction && word.cells.some((cell) => keyOf(cell) === keyOf(active))) ?? words[0],
    [active, activeWordId, direction, words],
  );
  const solvedWords = useMemo(() => new Set(words.filter((word) => word.cells.every((cell) => {
    const entered = letters[keyOf(cell)] ?? "";
    const solution = puzzle.grid[cell.row][cell.col].letter ?? "";
    return entered === solution;
  })).map((word) => word.id)), [letters, puzzle.grid, words]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      previousSolvedWords.current = new Set();
      return;
    }
    const newlySolved = [...solvedWords].filter((wordId) => !previousSolvedWords.current.has(wordId));
    previousSolvedWords.current = new Set(solvedWords);
    if (!activeWord || !newlySolved.includes(activeWord.id)) return;

    const nextUnsolvedIn = (sequence: Word[]) => {
      const currentIndex = sequence.findIndex((word) => word.id === activeWord.id);
      return Array.from({ length: sequence.length }, (_, offset) => sequence[(currentIndex + offset + 1) % sequence.length])
        .find((word) => !solvedWords.has(word.id));
    };
    const sameDirection = words.filter((word) => word.direction === activeWord.direction);
    const nextWord = nextUnsolvedIn(sameDirection) ?? nextUnsolvedIn(words);
    if (nextWord) {
      setDirection(nextWord.direction);
      setActiveWordId(nextWord.id);
      setActive(nextWord.cells[0]);
    }
  }, [activeWord, isPlaying, solvedWords, words]);

  useEffect(() => {
    if (activeWord?.direction !== direction) setDirection(activeWord?.direction ?? "across");
  }, [activeWord, direction]);

  function selectWord(word: Word) {
    if (!isPlaying) return;
    setActiveWordId(word.id);
    setDirection(word.direction);
    setActive(word.cells[0]);
    requestAnimationFrame(() => gameRef.current?.focus());
  }

  function openDemo() {
    setPuzzle(demoPuzzle);
    setLetters({});
    setIsPlaying(false);
    setElapsedSeconds(0);
    setActive({ row: 0, col: 1 });
    setDirection("across");
    setActiveWordId("across:1");
    setStatus("Demostración abierta. Volvé a Crear para generar una grilla con tus propias pistas.");
    setScreen("play");
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { size, across: parseEntries(across, "across"), down: parseEntries(down, "down") };
    setStatus("Buscando una configuración válida…");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const generated = await response.json();
      if (!response.ok) throw new Error(generated.detail ?? generated.error ?? "No se pudo generar el crucigrama.");
      const generatedPuzzle = generated as Puzzle;
      setPuzzle(generatedPuzzle);
      setLetters({});
      setIsPlaying(false);
      setElapsedSeconds(0);
      const firstOpen = generatedPuzzle.grid.flatMap((gridRow: GridCell[], rowIndex: number) => gridRow.map((cell, col) => ({ cell, row: rowIndex, col }))).find(({ cell }: { cell: GridCell }) => !cell.blocked);
      if (firstOpen) {
        setActive({ row: firstOpen.row, col: firstOpen.col });
        const startingWord = Object.entries(generatedPuzzle.placements ?? {}).find(([, placement]) => placement.row === firstOpen.row && placement.col === firstOpen.col && placement.direction === "across")
          ?? Object.entries(generatedPuzzle.placements ?? {}).find(([, placement]) => placement.row === firstOpen.row && placement.col === firstOpen.col);
        setActiveWordId(startingWord?.[0]);
      }
      setDirection("across");
      setStatus("Crucigrama generado. Las respuestas permanecen ocultas durante el juego.");
      setScreen("play");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo conectar con el generador.");
    }
  }

  function moveInWord(step: number) {
    const destination = nextEditableCell(active, step);
    if (destination) setActive(destination);
  }

  function nextEditableCell(from: Cell, step: number) {
    if (!activeWord) return undefined;
    const index = activeWord.cells.findIndex((cell) => keyOf(cell) === keyOf(from));
    let nextIndex = index + step;
    while (activeWord.cells[nextIndex] && isCellLocked(activeWord.cells[nextIndex])) nextIndex += step;
    return activeWord.cells[nextIndex];
  }

  function isCellLocked(cell: Cell) {
    return words.some((word) => solvedWords.has(word.id) && word.cells.some((wordCell) => keyOf(wordCell) === keyOf(cell)));
  }

  function moveToAdjacentWord(axis: "row" | "col", step: number) {
    if (!activeWord) return;
    const currentAxis = axis === "row" ? active.row : active.col;
    const candidates = words
      .filter((word) => word.direction === direction && word.number !== activeWord.number)
      .map((word) => {
        const wordAxis = axis === "row" ? word.cells[0].row : word.cells[0].col;
        const distance = (wordAxis - currentAxis) * step;
        const nearestCell = word.cells.reduce((nearest, cell) => {
          const nearestOffset = Math.abs((axis === "row" ? nearest.col : nearest.row) - (axis === "row" ? active.col : active.row));
          const cellOffset = Math.abs((axis === "row" ? cell.col : cell.row) - (axis === "row" ? active.col : active.row));
          return cellOffset < nearestOffset ? cell : nearest;
        });
        const offset = Math.abs((axis === "row" ? nearestCell.col : nearestCell.row) - (axis === "row" ? active.col : active.row));
        return { word, distance, nearestCell, offset };
      })
      .filter((candidate) => candidate.distance > 0)
      .sort((left, right) => left.distance - right.distance || left.offset - right.offset);
    if (candidates[0]) {
      setActiveWordId(candidates[0].word.id);
      setActive(candidates[0].nearestCell);
    }
  }

  function selectNextWord(offset: number) {
    const sequence = words.filter((word) => word.direction === direction);
    if (!sequence.length || !activeWord) return;
    const index = sequence.findIndex((word) => word.number === activeWord.number);
    selectWord(sequence[(index + offset + sequence.length) % sequence.length]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isPlaying) return;
    if (event.key === " ") {
      event.preventDefault();
      const nextDirection: Direction = direction === "across" ? "down" : "across";
      const nextWord = words.find((word) => word.direction === nextDirection && word.cells.some((cell) => keyOf(cell) === keyOf(active)));
      if (nextWord) {
        setDirection(nextDirection);
        setActiveWordId(nextWord.id);
      }
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      return selectNextWord(event.shiftKey ? -1 : 1);
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      if (direction === "down") moveInWord(event.key === "ArrowUp" ? -1 : 1);
      else moveToAdjacentWord("row", event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (direction === "across") moveInWord(event.key === "ArrowLeft" ? -1 : 1);
      else moveToAdjacentWord("col", event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      const editableCell = isCellLocked(active) ? nextEditableCell(active, -1) : active;
      if (!editableCell) return;
      setLetters((current) => ({ ...current, [keyOf(editableCell)]: "" }));
      const previousCell = nextEditableCell(editableCell, -1);
      if (previousCell) setActive(previousCell);
      return;
    }
    if (/^[a-záéíóúñ]$/i.test(event.key)) {
      event.preventDefault();
      const editableCell = isCellLocked(active) ? nextEditableCell(active, 1) : active;
      if (!editableCell) return;
      const normalizedLetter = event.key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      setLetters((current) => ({ ...current, [keyOf(editableCell)]: normalizedLetter }));
      const nextCell = nextEditableCell(editableCell, 1);
      if (nextCell) setActive(nextCell);
    }
  }

  return (
    <main>
      <header className="nav-shell">
        <button className="brand" onClick={() => setScreen("create")}>CRUCI <span>CUANDO</span> QUIERAS</button>
        <nav aria-label="Navegación principal">
          <button className={screen === "create" ? "nav-active" : ""} onClick={() => setScreen("create")}>Crear</button>
          <button className={screen === "play" ? "nav-active" : ""} onClick={openDemo}>Jugar</button>
        </nav>
        <span className="edition">V.01 · LOCAL</span>
      </header>

      {screen === "create" ? (
        <section className="creator-shell">
          <div className="hero-copy">
            <p className="eyebrow">Tu archivo de crucigramas</p>
            <h1>Las palabras<br />encuentran<br /><em>su lugar.</em></h1>
            <p className="lede">Pegá las pistas y respuestas de un crucigrama. El motor buscará una grilla jugable, no una copia del original.</p>
          </div>

          <form className="builder-card" onSubmit={generate}>
            <div className="builder-heading">
              <span>01 — Construir</span>
              <label>Grilla
                <input aria-label="Tamaño de grilla" type="number" min="5" max="21" value={size} onChange={(event) => setSize(Number(event.target.value))} />
              </label>
            </div>
            <p className="format-note">Una línea por pista: <code>número | pista | respuesta</code></p>
            <div className="entry-columns">
              <label>Horizontales<textarea value={across} onChange={(event) => setAcross(event.target.value)} /></label>
              <label>Verticales<textarea value={down} onChange={(event) => setDown(event.target.value)} /></label>
            </div>
            <div className="builder-footer">
              <button className="primary" type="submit">Generar crucigrama</button>
              <button className="text-button" type="button" onClick={openDemo}>Ver demostración</button>
            </div>
            {status && <p className="status" role="status">{status}</p>}
          </form>
        </section>
      ) : (
        <section className="game-shell" ref={gameRef} tabIndex={-1} onKeyDown={onKeyDown}>
          <div className="game-header">
            <p className="eyebrow">Edición de prueba · {puzzle.size} × {puzzle.size}</p>
            <div><h1>Resolver sin ruido.</h1><button className="text-button" onClick={() => setScreen("create")}>Crear otra grilla</button></div>
          </div>

          {isPlaying && <CluePanel title="Verticales" clues={clues.down} direction="down" words={words} activeWord={activeWord} onSelect={selectWord} />}
          <div className="board-wrap" aria-label="Crucigrama jugable">
            <div className="board-toolbar">
              <button className="primary play-button" onClick={() => { setIsPlaying(true); requestAnimationFrame(() => gameRef.current?.focus()); }} disabled={isPlaying}>
                {isPlaying ? "En juego" : "Jugar"}
              </button>
              <time className="timer" dateTime={`PT${elapsedSeconds}S`}>{String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}</time>
              {!isPlaying && <span>La grilla se habilita al comenzar.</span>}
            </div>
            {isPlaying ? <div className="board" style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }}>
              {puzzle.grid.flatMap((row, rowIndex) => row.map((cell, colIndex) => {
                const blocked = cell.blocked;
                const current = active.row === rowIndex && active.col === colIndex;
                const key = keyOf({ row: rowIndex, col: colIndex });
                const inWord = activeWord?.cells.some((wordCell) => keyOf(wordCell) === key);
                const solved = words.some((word) => solvedWords.has(word.id) && word.cells.some((wordCell) => keyOf(wordCell) === key));
                const locked = isCellLocked({ row: rowIndex, col: colIndex });
                return blocked ? <span className="cell blocked" key={key} /> : (
                  <button key={key} disabled={!isPlaying} onClick={() => {
                    const matchingWords = words.filter((word) => word.cells.some((wordCell) => keyOf(wordCell) === key));
                    const matchingDirection = matchingWords.find((word) => word.direction === direction) ?? matchingWords[0];
                    if (matchingDirection) selectWord(matchingDirection);
                    setActive({ row: rowIndex, col: colIndex });
                  }} className={`cell ${current ? "selected" : ""} ${inWord ? "in-word" : ""} ${solved ? "solved" : ""} ${locked ? "locked" : ""}`} aria-label={`Fila ${rowIndex + 1}, columna ${colIndex + 1}${locked ? ", bloqueada" : ""}`}>
                    {cell.number && <small>{cell.number}</small>}
                    <strong>{letters[key] ?? ""}</strong>
                  </button>
                );
              }))}
            </div> : <div className="board-preview"><span>Crucigrama listo</span><strong>{puzzle.size} × {puzzle.size}</strong><p>Presioná Jugar para revelar la grilla.</p></div>}
            {isPlaying && <p className="keyboard-hint">Espacio: cambiar dirección · Flecha perpendicular: palabra vecina · Tab: siguiente pista · Shift + Tab: anterior · Borrar: corregir.</p>}
          </div>
          {isPlaying && <CluePanel title="Horizontales" clues={clues.across} direction="across" words={words} activeWord={activeWord} onSelect={selectWord} />}
        </section>
      )}
    </main>
  );
}

function CluePanel({ title, clues, direction, words, activeWord, onSelect }: { title: string; clues: readonly (readonly [number, string])[]; direction: Direction; words: Word[]; activeWord?: Word; onSelect: (word: Word) => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const selected = activeWord?.direction === direction ? activeWord.number : undefined;

  useEffect(() => {
    const panel = panelRef.current;
    const clue = panel?.querySelector<HTMLElement>(".active-clue");
    if (!panel || !clue) return;
    const frame = requestAnimationFrame(() => {
      const panelRect = panel.getBoundingClientRect();
      const clueRect = clue.getBoundingClientRect();
      const targetTop = panel.scrollTop + clueRect.top - panelRect.top - (panel.clientHeight - clue.clientHeight) / 2;
      panel.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  return (
    <aside className="clue-panel" ref={panelRef}>
      <h2>{title}</h2>
      <ol>
        {clues.map(([number, clue]) => {
          const word = words.find((item) => item.direction === direction && item.number === number);
          const isSelected = selected === number;
          return <li id={`clue-${direction}-${number}`} key={number}><button className={isSelected ? "active-clue" : ""} onClick={() => word && onSelect(word)}><b>{number}</b><span>{clue}</span></button></li>;
        })}
      </ol>
    </aside>
  );
}
