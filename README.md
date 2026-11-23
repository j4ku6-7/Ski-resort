# Ski Resort

A 3D ski-resort builder on real mountains, built with Three.js (vendored, no build step).

**Run:** open `index.html` in a browser. Everything is loaded with plain script tags, so double-clicking the file works.

## Resorts
- **Jasná – Chopok** (Nízke Tatry)
- **Tatranská Lomnica** (Vysoké Tatry)
- **Hintertuxer Gletscher** (Zillertal, Tirol): valley station at 1 500 m, up to Olperer 3 476 m
- **Mölltaler Gletscher** (Hohe Tauern): skiers arrive at 2 200 m by the underground Gletscher Express from Innerfragant
- **Ankogel – Mallnitz** (Hohe Tauern): from the Ankogelbahn valley station at 1 280 m

Each map has its own treeline (about 1 550 m in the Tatras, about 2 000 m in the Alps), and glaciers get an icy tint. Positions of the Austrian lift stations and peaks come from OpenStreetMap (© OpenStreetMap contributors, ODbL).

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
   | 6-person gondola | 2 400/h | 5 m/s | compact, cheaper gondola |
   | 8-person gondola | 2 880/h | 6 m/s | enclosed, up to 6 km |
   | 10-person gondola | 3 600/h | 6 m/s | panoramic cabins |
   | Funitel | 4 800/h | 7 m/s | wide cabins on twin ropes, very stable |
   | 3S tricable gondola | 4 800/h | 7.5 m/s | spans of several km, only a few huge pylons |
   | Aerial tramway | about 400/h | 10 m/s | two shuttling cabins, very few towers, spans cliffs |

   **Pylons:** tick *Place pylons myself* in the lift picker, or press *Edit pylons* in a lift's panel. Click the lift line to add a pylon, drag pylons along the line, use `+`/`−` to change their height (Shift = 5 m steps) and `Del` to remove one. Taller pylons cost more. The rope is coloured by the safety check: green is fine, orange is tight, red means carriers hit the snow, and yellow means chairs hang too high above the ground to evacuate. Spans that are too long are flagged as well. A lift that fails inspection stays closed. Press Done to pay for the changes (removed pylons are refunded at 50%), or Cancel to revert. Placing pylons yourself is often cheaper than the automatic layout. The editor flies the camera to a side view of the lift and opens a **side-view profile** along the bottom of the screen, with the vertical scale stretched so every pylon is visible. Click it to add a pylon at that height, drag a pylon left/right to move it or up/down to change its height, and right-click to remove it.

   **Sheave trains:** on every pylon the rope runs over a curved train of wheels that turns it gradually from the incoming angle to the outgoing one, and the carriers follow that curve. In the pylon editor you can set, per pylon:
   - the number of wheels (2–16, or automatic), with each wheel allowed to bend the rope by at most 4.5°;
   - where the wheels go: bottom (support), top (hold-down) or both.

   Inspection fails a pylon whose rope bends too much per wheel, a rope that would lift off support-only wheels, and a rope that presses down on top-only wheels. Extra wheels cost money. The side view draws every wheel and marks a failing pylon in red.

   **Mid-stations and angle stations** (detachable chairs and gondolas):
   - *Add a station on this line* in the lift panel, then click the line, places an intermediate station where skiers can get on and off, or stay on and ride through.
   - Starting a new lift of the same type at the top of an existing one, or ending one at its bottom, continues the line through an **angle station**, which can turn it by up to 90°. The shared building saves 40% of a terminal.
   - Each station is one hall with both sections' bullwheels, and it can be removed again from the panel.

   **Linked sheaves, lean and Y-pylons:**
   - Tick **🔗 Link sheaves with next pylon** to join up to 4 pylons (at most 45 m apart) into one long, evenly curved wheel battery, which spreads a big bend over all their wheels. The heads of linked pylons follow the rope curve. The automatic layout does this by itself at sharp crests.
   - Pylons can **lean** up to ±30° along the line, and **Align with rope** leans one along the combined pull of its ropes.
   - A **Y-pylon** (chosen per pylon) is two standard pylons branching from one foundation along the line, each with its own head; the two heads share one sheave battery, for big bends. Adjust the spread between the heads (8–30 m).

   **Modern MGD tube** (default for detachable chairs and gondolas, based on modern 8-person gondola pylons): a conical galvanised tube on a flange plate, a box crossarm with a trapezoidal frame arching over the sheave trains, walkways that follow the sheave trains, sheave trains of paired-wheel bogies on balancer beams, catwalks with railings, a caged ladder and a maintenance gantry.

   **Other pylon styles:** classic tube (cheapest), lattice truss (×1.5 cost, up to 1.6× taller) and portal frame (×1.3 cost, straddles wide ropes). Choose a style for the whole lift in its panel, or for a single pylon in the pylon editor. Each pylon carries sheave trains tilted to the rope angle, with more wheels where the rope bends more, and hold-down wheels above the rope where it bends upward over a pylon in a dip. Stations have concrete plinths, glass walls, gabled roofs in the lift's accent colour, a visible bullwheel and a boarding deck, and the bottom station has a machine house. Chairs and cabins can be painted in nine colours.

   Click a lift in View mode to rename it, change its line speed and how many carriers run, open or close it, upgrade it to another type (half the old lift's value is credited), or remove it.
2. **Ski run**: drag from a lift top down the slope, or click point by point. The line is smoothed into a curve. While you draw, the terrain shows a slope map and the preview is coloured by local steepness, with the steepest section marked. End on a lift bottom or a lodge, or press Enter, to finish.
   **Connecting pistes:** start a run in the middle of an existing piste to *branch off*, or end it on another piste to *join* it (a shortcut or merge). A cyan ring shows where it will connect. The piste is split there, keeping its number, and skiers choose which way to go at the junction. Lift stations can be placed on a piste the same way.
   Difficulty comes from the steepest 50 m of the run: Blue ≤ 25 %, Red ≤ 40 %, Black > 40 %.
3. Skiers arrive at lodges and buy a day pass (€38):
   - Beginners ski only blue runs.
   - Intermediates ski blue and red runs.
   - Experts ski all runs.
4. Skiers lose happiness from long queues, from dead ends (they have to walk back), and from having nothing they can ski. Happiness drives reputation, and reputation drives visitor numbers.

**Planning:** switch on **📐 Plan only** in the toolbar, and new lifts and runs become blueprints, drawn as blue ghosts. Plans are free: they cut no trees, move no earth, and skiers ignore them. You can still change a planned lift's type, edit its pylons, or delete the plan. The **📐 Plans** panel in the top bar lists every plan with its current price and any inspection problems, and builds them one at a time or all at once. Building pays the real cost at that moment, then fells the trees and does the earthworks. Plans are saved.

**Camera:** drag to rotate, right-drag to pan, and scroll to zoom toward the cursor. WASD or the arrow keys move, Q/E turn, and double-click (in View mode) flies there.

Keys: `1`–`5` pick tools, `H` toggles height lines (a thin line every 50 m, bold every 250 m), `Esc` cancels, `Backspace` removes the last run point, `[` `]` change the tree brush size, `Space` pauses.

**Piste angle & grading** (in the run tool panel):
- **Hold angle while drawing:** the run steers across the hillside so the natural ground drops at the angle you pick. On a steep hill it traverses more.
- **Terraform this run:** bulldozers cut and fill so no pitch is steeper than that angle, and level the piste side to side across the hill, blending back to the natural slope at the edges. Earthworks cost €0.50 per m³. The stations keep their height, so a steep straight line can't be graded into a blue; traverse instead.
- Blue ≤ 14° (25%), Red ≤ 22° (40%), Black steeper. Earthworks are saved and replayed on load.
- **Seeing the earthworks:** while you draw a graded run, the terrain shows what will be dug away (red) and filled (blue), with stronger colour for deeper work. The hint bar shows the cut and fill volumes and the deepest cut and fill. The **⛏ Earthworks** button in the top bar shows everything you've reshaped compared with the original mountain.
- **When it's needed:** the run tool warns when an ungraded run leans more than about 17° sideways across the hill, which skiers dislike (beginners most), or when it's steeper than your chosen angle. **Terraform to ≤ X°** fixes it in one click.

**Trees:** felling costs €150 per tree, and runs and lifts through forest include that cost. Clear more than 10% of the forest and the views suffer, so fewer visitors come. Use the Cut trees tool to clear areas by hand.
