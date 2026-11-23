# Ski Resort

A 3D ski-resort builder on real mountains, built with Three.js (vendored, no build step).

**Run:** open `index.html` in a browser. Everything is loaded with plain script tags, so double-clicking the file works.

## Resorts
- **Jasná – Chopok** (Nízke Tatry)
- **Tatranská Lomnica** (Vysoké Tatry)

The terrain is real elevation data (AWS Terrain Tiles, about 20 m resolution), baked into `data/<resort>.js` by `tools/fetch_dem.py`.

## How to play
1. **Chairlift / Gondola**: click the bottom station, then the top. The ends snap to lodges (⌂) and to run ends.
2. **Ski run**: click the top (snap to a lift top), then click points down the slope. Press Enter, or click a lodge or lift bottom, to finish.
   Difficulty comes from the steepest 50 m of the run: Blue ≤ 25 %, Red ≤ 40 %, Black > 40 %.
3. Skiers arrive at lodges and buy a day pass (€38):
   - Beginners ski only blue runs.
   - Intermediates ski blue and red runs.
   - Experts ski all runs.
4. Skiers lose happiness from long queues, from dead ends (they have to walk back), and from having nothing they can ski. Happiness drives reputation, and reputation drives visitor numbers.

Keys: `1`–`5` pick tools, `Esc` cancels, `Backspace` removes the last run point, `Space` pauses.
