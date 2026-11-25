"use client";

import { FormEvent, KeyboardEvent, useMemo, useState } from "react";

type Direction = "across" | "down";
type Cell = { row: number; col: number };

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

const starterAcross = "1 | Apodo del legendario Fischer del tablero. | BOBBY\n6 | Brújula digital del siglo XXI. | GPS\n9 | Quinto desde el Sol, pero el más grande. | JÚPITER";
const starterDown = "1 | Cincel para metales. | BURIL\n2 | Expresa su punto de vista. | OPINA\n3 | Retrato literario de alguien. | BIOGRAFÍA";

function keyOf(cell: Cell) {
  return `${cell.row}-${cell.col}`;
}

function isOpen(row: number, col: number) {
  return Boolean(demoRows[row]) && demoRows[row][col] !== "#";
}

function numberMap() {
  const numbers = new Map<string, number>();
  let number = 1;
  for (let row = 0; row < demoRows.length; row += 1) {
    for (let col = 0; col < demoRows[row].length; col += 1) {
      if (!isOpen(row, col)) continue;
      const startsAcross = (col === 0 || !isOpen(row, col - 1)) && col + 1 < demoRows[row].length && isOpen(row, col + 1);
      const startsDown = (row === 0 || !isOpen(row - 1, col)) && row + 1 < demoRows.length && isOpen(row + 1, col);
      if (startsAcross || startsDown) numbers.set(keyOf({ row, col }), number++);
    }
  }
  return numbers;
}

function parseEntries(source: string, direction: Direction) {
  return source
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length === 3 && Number(parts[0]))
    .map(([number, clue, answer]) => ({ number: Number(number), clue, answer, direction }));
}

export default function Home() {
  const [screen, setScreen] = useState<"create" | "play">("create");
  const [size, setSize] = useState(11);
  const [across, setAcross] = useState(starterAcross);
  const [down, setDown] = useState(starterDown);
  const [active, setActive] = useState<Cell>({ row: 0, col: 1 });
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const numbers = useMemo(numberMap, []);

  function openDemo() {
    setStatus("Demostración abierta. El generador Python se conectará por API en la siguiente etapa.");
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
      if (!response.ok) throw new Error((await response.json()).error ?? "No se pudo generar el crucigrama.");
      setStatus("La API devolvió un tablero. La visualización dinámica se conectará al contrato del generador.");
      setScreen("play");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo conectar con el generador.");
    }
  }

  function move(rowDelta: number, colDelta: number) {
    let row = active.row + rowDelta;
    let col = active.col + colDelta;
    while (row >= 0 && row < demoRows.length && col >= 0 && col < demoRows[0].length) {
      if (isOpen(row, col)) return setActive({ row, col });
      row += rowDelta;
      col += colDelta;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowUp") return event.preventDefault(), move(-1, 0);
    if (event.key === "ArrowDown") return event.preventDefault(), move(1, 0);
    if (event.key === "ArrowLeft") return event.preventDefault(), move(0, -1);
    if (event.key === "ArrowRight") return event.preventDefault(), move(0, 1);
    if (event.key === "Backspace") {
      event.preventDefault();
      setLetters((current) => ({ ...current, [keyOf(active)]: "" }));
      return;
    }
    if (/^[a-záéíóúñ]$/i.test(event.key)) {
      event.preventDefault();
      setLetters((current) => ({ ...current, [keyOf(active)]: event.key.toUpperCase() }));
      move(0, 1);
    }
  }

  return (
    <main>
      <header className="nav-shell">
        <button className="brand" onClick={() => setScreen("create")}>CRUCI<span>/</span>DIARIO</button>
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
        <section className="game-shell">
          <div className="game-intro">
            <p className="eyebrow">Edición de prueba · 11 × 11</p>
            <h1>Resolver<br />sin ruido.</h1>
            <button className="text-button" onClick={() => setScreen("create")}>Crear otra grilla</button>
          </div>

          <CluePanel title="Horizontales" clues={demoClues.across} />
          <div className="board-wrap" aria-label="Crucigrama jugable">
            <div className="board">
              {demoRows.flatMap((row, rowIndex) => row.split("").map((solution, colIndex) => {
                const blocked = solution === "#";
                const current = active.row === rowIndex && active.col === colIndex;
                const key = keyOf({ row: rowIndex, col: colIndex });
                return blocked ? <span className="cell blocked" key={key} /> : (
                  <button key={key} onClick={() => setActive({ row: rowIndex, col: colIndex })} onKeyDown={onKeyDown} className={`cell ${current ? "selected" : ""}`} aria-label={`Fila ${rowIndex + 1}, columna ${colIndex + 1}`}>
                    {numbers.get(key) && <small>{numbers.get(key)}</small>}
                    <strong>{letters[key] ?? ""}</strong>
                  </button>
                );
              }))}
            </div>
            <p className="keyboard-hint">Teclado: letras para escribir · flechas para recorrer · borrar para corregir.</p>
          </div>
          <CluePanel title="Verticales" clues={demoClues.down} />
        </section>
      )}
    </main>
  );
}

function CluePanel({ title, clues }: { title: string; clues: readonly (readonly [number, string])[] }) {
  return (
    <aside className="clue-panel">
      <h2>{title}</h2>
      <ol>
        {clues.map(([number, clue]) => <li key={number}><b>{number}</b><span>{clue}</span></li>)}
      </ol>
    </aside>
  );
}
