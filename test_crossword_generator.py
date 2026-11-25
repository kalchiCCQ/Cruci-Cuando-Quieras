import json
import unittest
from pathlib import Path

from crossword_generator import CrosswordError, CrosswordGenerator, normalize_answer


class CrosswordGeneratorTests(unittest.TestCase):
    def test_normalizes_accents_and_punctuation(self) -> None:
        self.assertEqual(normalize_answer("JÚPITER"), "JUPITER")
        self.assertEqual(normalize_answer("ALO-"), "ALO")

    def test_rejects_shared_numbers_with_different_initial_letters(self) -> None:
        payload = {
            "across": [{"number": 1, "clue": "Across", "answer": "CASA"}],
            "down": [{"number": 1, "clue": "Down", "answer": "PERA"}],
        }
        with self.assertRaisesRegex(CrosswordError, "first letter"):
            CrosswordGenerator.from_payload(payload)

    def test_generates_shared_start_for_matching_number(self) -> None:
        payload = {
            "across": [{"number": 1, "clue": "Animal", "answer": "GATO"}],
            "down": [{"number": 1, "clue": "Flower", "answer": "GALA"}],
        }
        generator = CrosswordGenerator.from_payload(payload, size=5)
        result = generator.generate(timeout_seconds=1)
        self.assertEqual(result["placements"]["across:1"]["row"], result["placements"]["down:1"]["row"])
        self.assertEqual(result["placements"]["across:1"]["col"], result["placements"]["down:1"]["col"])
        numbers = [cell["number"] for row in result["grid"] for cell in row if cell["number"] is not None]
        self.assertEqual(numbers, [1])

    def test_reads_grid_size_from_input(self) -> None:
        payload = {
            "size": 5,
            "across": [{"number": 1, "clue": "Animal", "answer": "GATO"}],
            "down": [{"number": 1, "clue": "Flower", "answer": "GALA"}],
        }
        result = CrosswordGenerator.from_payload(payload).generate(timeout_seconds=1)
        self.assertEqual(result["size"], 5)

    def test_generates_real_dataset_without_a_template(self) -> None:
        payload = json.loads(Path("sample_input.json").read_text(encoding="utf-8"))
        self.assertNotIn("template", payload)
        result = CrosswordGenerator.from_payload(payload, max_nodes=1_000_000).generate(timeout_seconds=10)
        self.assertEqual(len(result["placements"]), 44)
        self.assertEqual(result["grid"][0][1]["number"], 1)
        self.assertEqual(result["grid"][5][0]["letter"], "E")

    def test_generates_second_real_dataset_without_a_template(self) -> None:
        payload = json.loads(Path("sample_input_2.json").read_text(encoding="utf-8"))
        result = CrosswordGenerator.from_payload(payload, max_nodes=1_000_000).generate(timeout_seconds=10)
        self.assertEqual(len(result["placements"]), 44)
        self.assertEqual(result["grid"][0][1]["letter"], "B")
        self.assertEqual(result["grid"][0][1]["number"], 1)

if __name__ == "__main__":
    unittest.main()
