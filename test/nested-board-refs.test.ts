import assert from "node:assert/strict";
import test from "node:test";
import { hideInFileExplorerCss, linkedBoardPaths, nestedBoardPaths } from "../src/nested-board-refs.ts";
import { parseBoard } from "../src/types.ts";

const board = parseBoard(JSON.stringify({
  version: 1,
  items: [
    { id: "a", type: "board", path: "Films/Trip/Shotlist.board", x: 0, y: 0, w: 220 },
    { id: "b", type: "board", path: "Overview.board", x: 0, y: 0, w: 220 },
    { id: "c", type: "board", path: "Films/Trip/Trip.board", x: 0, y: 0, w: 220 },
    { id: "d", type: "note", path: "Films/Trip/Notes.board", x: 0, y: 0, w: 220 },
  ],
  edges: [],
}));

// "New board" creates nested boards next to their parent, so only same-folder
// board cards count; hiding a board linked from elsewhere would make it vanish
// from its own folder
test("nestedBoardPaths keeps only board cards in the board's own folder", () => {
  assert.deepEqual(nestedBoardPaths("Films/Trip/Trip.board", board), ["Films/Trip/Shotlist.board"]);
});

// a board linking to itself or a non-board card with a path must not count as
// a reference, or deleting the card would never trash the file
test("linkedBoardPaths ignores self references and non-board cards", () => {
  assert.deepEqual(linkedBoardPaths("Films/Trip/Trip.board", board), ["Films/Trip/Shotlist.board", "Overview.board"]);
});

test("hideInFileExplorerCss is empty without paths and quotes paths safely", () => {
  assert.equal(hideInFileExplorerCss([]), "");
  const css = hideInFileExplorerCss(['Films/My "best" shot.board']);
  assert.match(css, /data-path="Films\/My \\"best\\" shot\.board"/);
  assert.match(css, /display: none;/);
});
