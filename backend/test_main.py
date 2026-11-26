import unittest

from main import public_puzzle


class RoomPuzzleTests(unittest.TestCase):
    def test_public_puzzle_strips_solution_letters(self):
        public, solution = public_puzzle({
            "size": 2,
            "grid": [[
                {"blocked": False, "letter": "A", "number": 1},
                {"blocked": True, "letter": None, "number": None},
            ]],
        })

        self.assertIsNone(public["grid"][0][0]["letter"])
        self.assertEqual(solution["grid"][0][0], "A")
        self.assertIsNone(solution["grid"][0][1])

