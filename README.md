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

## Saving and playing on another computer
Progress saves automatically in your browser every 20 seconds, after every change you build, at the end of each day and when you close the tab. The top bar shows when it last saved.

### Player ID and the save server
With the save server running, progress is also stored on the server under your **player ID**, so you can continue on any computer that can reach it.
1. Start the server on one computer: `node server.js` (Node 18 or newer, no install needed). It prints the addresses to open, for example `http://localhost:8080/` on that computer and `http://192.168.1.20:8080/` for other computers on the same network. Saves are kept in the `saves/` folder (or wherever `SAVES_DIR` points; `PORT` changes the port).
2. Open the game from that address. The menu shows your player ID, for example `K7QM4-XPA2B`, with a Copy button.
3. On the other computer, open the same address, type the ID under **Load progress** and confirm. That computer then uses the same ID and loads your resorts. Resorts that were only played there are kept and added to the ID.

From then on both computers stay in sync on their own: the game uploads while you play (at most every 15 seconds) and downloads the newest progress when the menu opens. If you play the same resort on both computers without them syncing in between (for example while the server was off), the resort's card shows both versions and you pick which to keep. If the server can't be reached, the game keeps saving in the browser and uploads once the server is back.

If you open `index.html` as a file instead, enter the server's address in the menu to sync with it.

Anyone who knows a player ID can load and overwrite its progress, so share it only with yourself. To reach the server from outside your home network, run `server.js` on any machine that runs Node and is reachable from both computers.

### Save files
To move a save without the server:
1. In the game, press **💾 Save file**. A small `.json` file goes to your downloads.
2. Copy the game folder and that file to the other computer, for example on a USB stick or by cloning this repository.
3. Open `index.html` there, click **📂 Import save file** in the menu, and pick the file.

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

   **No overlapping buildings:** if a new station would overlap a lodge or another station, it is placed on the nearest free ground beside it (sideways first) and joined to the original spot by a footpath. Skiers walk the footpath freely, so lifts and runs at either end are all reachable.

   **Moving stations:** *⇄ Move bottom/top station* in the lift panel lets you place a station yourself, within 220 m of its lodge or runs. The preview is green if the spot is fine, orange if the new line crosses another lift and red if it's blocked; click the original spot to put it back. Moving is free unless the lift gets longer, in which case you pay only for the extra length. Automatic placement avoids crossing other lift lines when it can.

   **Mid-stations and angle stations** (detachable chairs, gondolas, 3S and aerial tramways):
   - *Add a station on this line* in the lift panel, then click the line, places an intermediate station where skiers can get on and off, or stay on and ride through.
   - Starting a new lift of the same type at the top of an existing one, or ending one at its bottom, continues the line through an **angle station**, which can turn it by up to 90°. The shared building saves 40% of a terminal.
   - The station is built as two wings, each lined up with its own section, meeting where the line turns. Each wing runs from its entrance past the turn to its section's bullwheel. The lower section's bullwheel sits on a tensioning carriage, and the upper's has the drive motor and gearbox. The rails have tyre conveyors. The station can be removed again from the panel.
   - On an **aerial tramway** a station splits the line into two tramways, each with its own pair of shuttling cabins. Skiers change cabins there. Each section is shorter, so its cabins make more trips and the line carries more people per hour.
   - The easiest way: press **⤴ Build the next section from the top station** in a lift's panel, then click where the new section should end. Keep the same type for a shared station that skiers can ride through. Pick another type for a **transfer station**: the new lift gets its own station beside the top station, joined by a footpath, and skiers change lifts there.

   **Linked sheaves, lean and Y-pylons:**
   - Tick **🔗 Link sheaves with next pylon** to join up to 4 pylons (at most 45 m apart) into one long, evenly curved wheel battery, which spreads a big bend over all their wheels. The battery reaches out past the first and last pylon, further for bigger bends, and the rope runs onto and off it without a kink, so all of the bend goes to the wheels. The heads of linked pylons follow the rope curve. The automatic layout does this by itself at sharp crests.
   - Pylons can **lean** up to ±30° along the line, and **Align with rope** leans one along the combined pull of its ropes.
   - A **twin-leg compression pylon** (chosen per pylon) has two tapered box legs one behind the other along the line, flared into one long platform head on lattice anchor frames, with long sheave trains, wide grated walkways and a trapezoidal gantry over the ropes at each end. Spread 12–40 m.
   - A **Y-pylon** (chosen per pylon) is two standard pylons branching from one foundation along the line, each with its own head; the two heads share one sheave battery, for big bends. Adjust the spread between the heads (8–30 m). A Y can lean as a whole (±30°, or Align with rope): the trunk tilts and both heads shift along the line.

   **Modern MGD tube** (default for detachable chairs and gondolas, based on modern 8-person gondola pylons): a conical galvanised tube on a flange plate, a crossarm out to the sheave trains with a lifting gantry above it (a top beam over the ropes on struts that flare outwards, knee brackets, posts and railing hoops), walkways inside the sheave trains that follow their curve, sheave trains of paired-wheel bogies on balancer beams, catwalks with railings, a caged ladder and a maintenance gantry.

   **Other pylon styles:** classic tube (cheapest), lattice truss (×1.5 cost, up to 1.6× taller) and portal frame (×1.3 cost, straddles wide ropes). Choose a style for the whole lift in its panel, or for a single pylon in the pylon editor. Each pylon carries sheave trains tilted to the rope angle, with more wheels where the rope bends more, and hold-down wheels above the rope where it bends upward over a pylon in a dip. Stations have concrete plinths, glass walls, gabled roofs in the lift's accent colour, a visible bullwheel and a boarding deck, and the bottom station has a machine house. Chairs and cabins can be painted in nine colours.

   **Station style** (detachable chairs and gondolas, in the lift panel):
   - **Modern canopy**, the default for gondolas: a long, rounded glass hood with a red outline over the station girder, on central columns, with a raised boarding deck and stairs.
   - **Station building**: a stone-clad ground floor with a clad hall above it, a band of windows, and ends that lean outward.
   - **Classic hall**, the default for chairlifts.

   Mid-stations take the same style.

   **Riding down:** guests can ride gondolas, funitels, 3S and tramways down as well as up. They do it when they're tired and riding is the quickest way home, to get to or from a restaurant, or when there's nothing they can ski from where they are. The lift panel shows how many rode down today.

   Click a lift in View mode to rename it, change its line speed and how many carriers run, open or close it, upgrade it to another type (half the old lift's value is credited), or remove it.
2. **Ski run**: drag from a lift top down the slope, or click point by point. The line is smoothed into a curve. While you draw, the terrain shows a slope map and the preview is coloured by local steepness, with the steepest section marked. End on a lift bottom or a lodge, or press Enter, to finish.
   **Connecting pistes:** start a run in the middle of an existing piste to *branch off*, or end it on another piste to *join* it (a shortcut or merge). A cyan ring shows where it will connect. The piste is split there, keeping its number, and skiers choose which way to go at the junction. Lift stations can be placed on a piste the same way.
   Difficulty comes from the steepest 50 m of the run: Blue ≤ 25 %, Red ≤ 40 %, Black > 40 %.
3. Skiers arrive at lodges and buy a day pass (€38):
   - Beginners ski only blue runs.
   - Intermediates ski blue and red runs.
   - Experts ski all runs.
   - Freeriders (about 1 in 12) ride the lifts and then ski their own off-piste lines down the real mountain, up to 45°, to a lift bottom or a lodge. They pick the biggest lines from each lift top, and they'll also ski red and black runs. A lift whose top has no run but does have a freeride line down still gets freeriders.

   Better skiers know the mountain: intermediates, and even more so experts and freeriders, go for the lifts with short queues, while beginners stick with the lift in front of them. So a second lift next to a busy one mainly draws away the good skiers.
4. **Food:** guests want a coffee mid-morning, lunch around midday, and a coffee in the afternoon. When it's time, they take the quickest way to a place to eat, counting skiing, lift queues and footpaths, and pay there. The base lodges have 300 seats. With the **🍽 Restaurant** tool (key `6`) you can build:
   - a **Mountain hut** (90 seats);
   - a **Panorama restaurant** (260 seats).

   Each sits within 160 m of a lift station, a piste or a lodge, joined by a footpath, with its terrace facing downhill. Restaurants earn food and drink sales but cost money to run every day. A full restaurant makes guests wait, and guests who can't get to food in time get unhappy.
5. Skiers lose happiness from long queues, from dead ends (they have to walk back), and from having nothing they can ski. Happiness drives reputation, and reputation drives visitor numbers.

**Planning:** switch on **📐 Plan only** in the toolbar, and new lifts and runs become blueprints, drawn as blue ghosts. Plans are free: they cut no trees, move no earth, and skiers ignore them. You can still change a planned lift's type, edit its pylons, or delete the plan. The **📐 Plans** panel in the top bar lists every plan with its current price and any inspection problems, and builds them one at a time or all at once. Building pays the real cost at that moment, then fells the trees and does the earthworks. Plans are saved.

**Camera:** drag to rotate, right-drag to pan, and scroll to zoom toward the cursor. WASD or the arrow keys move, Q/E turn, and double-click (in View mode) flies there.

Keys: `1`–`7` pick tools, `H` toggles height lines (a thin line every 50 m, bold every 250 m), `Esc` cancels, `Backspace` removes the last run point, `[` `]` change the tree brush size, `Space` pauses.

**Piste angle & grading** (in the run tool panel):
- **Hold angle while drawing:** the run steers across the hillside so the natural ground drops at the angle you pick. On a steep hill it traverses more.
- **Terraform this run:** bulldozers cut and fill so no pitch is steeper than that angle, and level the piste side to side across the hill, blending back to the natural slope at the edges. Earthworks cost €0.50 per m³. The stations keep their height, so a steep straight line can't be graded into a blue; traverse instead.
- Blue ≤ 14° (25%), Red ≤ 22° (40%), Black steeper. Earthworks are saved and replayed on load.
- **Seeing the earthworks:** while you draw a graded run, the terrain shows what will be dug away (red) and filled (blue), with stronger colour for deeper work. The hint bar shows the cut and fill volumes and the deepest cut and fill. The **⛏ Earthworks** button in the top bar shows everything you've reshaped compared with the original mountain.
- **When it's needed:** the run tool warns when an ungraded run leans more than about 17° sideways across the hill, which skiers dislike (beginners most), or when it's steeper than your chosen angle. **Terraform to ≤ X°** fixes it in one click.

**Flatten** (key `7`): drag to level the ground to the height where you start, or click to level one spot to the height under the cursor. `[` `]` change the brush size. While you drag, the terrain shows what will be dug away (red) and filled (blue), with the volume and price. It costs €0.50 per m³ plus €150 per tree in the levelled area. Stations, runs and lifts on the ground follow the new surface, and the work is saved with the other earthworks.

**Trees:** felling costs €150 per tree, and runs and lifts through forest include that cost. Clear more than 10% of the forest and the views suffer, so fewer visitors come. Use the Cut trees tool to clear areas by hand.
