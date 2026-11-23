# Ski Resort

A 3D ski-resort builder on real mountains, built with Three.js (vendored, no build step).

**Run:** open `index.html` in a browser. Everything is loaded with plain script tags, so double-clicking the file works.

## Resorts
- **Jasná – Chopok** (Nízke Tatry)
- **Tatranská Lomnica** (Vysoké Tatry)

The terrain is real elevation data (AWS Terrain Tiles, about 20 m resolution), baked into `data/<resort>.js` by `tools/fetch_dem.py`.

## How to play
1. **Lift**: pick a type, then click the bottom station and the top. The ends snap to lodges (⌂) and to run ends. Towers are placed automatically wherever the rope would touch the snow, or would hang too high above it for chairs, and each tower costs money.

   | Type | Capacity | Speed | Notes |
   |---|---|---|---|
   | Magic carpet | 1 600/h | 0.9 m/s | ≤ 220 m and ≤ 25% grade, for the beginner area |
   | T-bar | 1 600/h | 3 m/s | surface lift, ≤ 60% grade, beginners hate it |
   | Double chair | 1 300/h | 2.3 m/s | fixed grip, cheap, long rides get cold |
   | Detachable quad | 2 400/h | 5 m/s | the workhorse |
   | 6-seat bubble chair | 4 000/h | 5 m/s | weather bubbles keep riders warm |
   | 8-person gondola | 2 880/h | 6 m/s | enclosed, up to 6 km |
   | Aerial tramway | about 400/h | 10 m/s | two shuttling cabins, very few towers, spans cliffs |

   Click a lift in View mode to rename it, change its line speed and how many carriers run, open or close it, upgrade it to another type (half the old lift's value is credited), or remove it.
2. **Ski run**: drag from a lift top down the slope, or click point by point. The line is smoothed into a curve. While you draw, the terrain shows a slope map and the preview is coloured by local steepness, with the steepest section marked. End on a lift bottom or a lodge, or press Enter, to finish.
   Difficulty comes from the steepest 50 m of the run: Blue ≤ 25 %, Red ≤ 40 %, Black > 40 %.
3. Skiers arrive at lodges and buy a day pass (€38):
   - Beginners ski only blue runs.
   - Intermediates ski blue and red runs.
   - Experts ski all runs.
4. Skiers lose happiness from long queues, from dead ends (they have to walk back), and from having nothing they can ski. Happiness drives reputation, and reputation drives visitor numbers.

Keys: `1`–`5` pick tools, `Esc` cancels, `Backspace` removes the last run point, `[` `]` change the tree brush size, `Space` pauses.

**Trees:** felling costs €150 per tree, and runs and lifts through forest include that cost. Clear more than 10% of the forest and the views suffer, so fewer visitors come. Use the Cut trees tool to clear areas by hand.
