# Among Us: Footprints Edition

Everything for the youth-group game night: the print pack, the briefing deck,
the facilitator playbook, and the live companion app. ~20–25 students,
grades 6–12, 5 counselors, 2–3 rounds. No student phones.

## Start here on game week

| | |
|---|---|
| **What to print** | `print-pack/PRINT-ME-FIRST.md` — every file, copy count, paper type |
| **The rules** | `print-pack/FACILITATOR-PLAYBOOK.pdf` — 4 pages, self-contained |
| **The briefing deck** | `deck/among-us-footprints.pptx` — rebuild with `node deck/build.js` |
| **The companion app** | `companion/SETUP.md` — 10-minute Firebase deploy, then QR the phones |

Still manual: 80 mazes (checked by eye), and confirm the GREEN origami kit is
easier than the BLUE one (green scores 2, blue 3).

## Layout

- `print-pack/` — the 13 finished PDFs + print guide. These are the artifacts; print from here.
- `deck/` — 24-slide briefing deck (`build.js` regenerates the .pptx).
- `companion/` — single-file web app (monitor + 5 role views, shared clock,
  deaths, sabotage, undo, answer lookup). `appdata.json` is embedded in
  `index.html`. `npm run test:emulator` runs the whole multi-device suite
  against Google's real Firestore emulator — see `companion/test/EMULATOR.md`,
  and read `companion/test/FINDINGS.md` before game night.
- `generators/` — every script that builds the pack. `legacy/` holds the
  16- and 25-group era, superseded but kept for history.
- `qa/` — the verification suite: reads the *rendered PDFs* back (poppler),
  re-solves all 80 sudokus from print, cross-checks cards, door sheets and
  the answer sheet against `specs/cardspec32.json`, audits ink margins.
- `specs/cardspec32.json` — the source of truth: 32 groups' tasks, two-letter
  door codes, verse triples (pew-Bible pages), gospel words, ball directions.
- `handoff/` — the original brief, playbook and slides this all started from.
- `tracker/` — the living design tracker (`data.json` + `render.py` →
  `footprints-tracker.html`), every decision of the design sessions logged.

## Regenerating

Python 3 + `reportlab` (`pip install reportlab`). Each generator is standalone:

    python3 generators/gen32.py            # re-roll the 32-group spec (writes cardspec32.json)
    python3 generators/make_cards_final.py # index cards (unique + 96-card deck)
    python3 generators/make_rest32.py      # door sheets, answer sheet, gospel box signs
    python3 generators/make_signs.py       # station signs
    python3 generators/make_gospel_cards.py
    python3 generators/make_sabotage.py    # props + Central Command script
    python3 generators/make_roles.py       # role cards
    python3 generators/make_playbook.py
    python3 generators/gen_sudoku.py       # 80 puzzles + answers (deterministic seed)
    python3 generators/export_appdata.py   # re-extract app data FROM the printed PDFs
    python3 qa/qa1.py && python3 qa/qa2b.py && python3 qa/qa3.py
    python3 generators/audit_margins.py    # every PDF ≥0.5in ink margins

Generators expect to run from the repo root and write into `footprints-print-pack/`
(symlink or rename `print-pack/` if you regenerate — paths are as they were in
the original workspace).

## The game in one breath

Cards are worth 11 (1/2/3-point tasks); the target is announced, never printed
(6 easy · 8 neutral · 10 hard). Three imposters kill by spoon tap, reload on a
silent 20-count. Bodies stay until found; meetings only happen via EMERGEN-C;
ejections are revealed on the spot — a crewmate ticks the death board, an
imposter is free. Sabotage: any tapped counselor dims the lights, five props
from five people in 2:00 — success +1:00, failure +2 deaths and −1:30.
Imposters win at the threshold (start 6); crew wins by everyone reaching the
target before the 8:00 clock runs out.
