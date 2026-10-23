# WAR WORLD — Art Bible

Modern military **top-down pixel art**. Readable first, beautiful second, detailed third.
Every asset is drawn **pixel by pixel at its final in-game size** — never a large render shrunk down.

## 1. Pixel density & scale

| Thing | World size (px) | Notes |
|---|---|---|
| Map tile | 16 | ground painted at 16 px/tile up close |
| Soldier | 5 × 6 | 3-frame walk, muzzle flash frame |
| Car / jeep | 6–9 | |
| APC / IFV / AA | 12–13 | |
| Main battle tank | 15 | turret + barrel always readable |
| Artillery / MLRS | 14–16 | |
| Drone | 18 span | |
| Fighter | 24–28 | |
| Helicopter | 22 body, 26 rotor | rotor animated, translucent sweep |
| Gunship / bomber | 34–44 | |
| Patrol boat | 14 | |
| Corvette / frigate / destroyer / cruiser | 22 / 28 / 34 / 38 | |
| Submarine | 30 | |
| Transport / cargo / supply | 34–38 | |
| Amphibious assault | 48 | |
| Aircraft carrier | 60 | angled deck, island on starboard |
| City lvl 1 / 2 / 3 | 48 / 76 / 108 | painted into the ground layer |

Zoom range: whole world → 8× (one art pixel = 8 screen pixels).

## 2. Light & shading
- Light comes from the **top-left**. Top/left silhouette edges +1 tone, bottom/right −1 tone.
- Each material uses a **5-tone ramp**. Shadows lean violet, highlights lean warm.
- No gradients, no anti-aliasing, no blur. Every pixel is a deliberate tone.
- Shadows of aircraft are separate violet silhouettes offset down-right by altitude.

## 3. Outlines
- 1 px selective outline `#1d1626` around every unit silhouette.
- Internal details are separated by dark tone lines, not outlines.
- Rotations use **RotSprite** (Scale2x ×3 → rotate → sample), preserving hand-drawn pixels.

## 4. Palette families
- **Air grey** `#2c3140 #4d5568 #78839a #a9b4c6 #d9e0ea`
- **Stealth** `#23262e #363b47 #4c5361 #677082 #8a93a4`
- **Olive** `#28331d #3f5129 #5e7539 #82994c #a9bb6c`
- **Tan** `#4a3a28 #735a3c #9c7e54 #c2a474 #e2cc9a`
- **Navy hull** = air grey; **deck** `#262a33 #353b47 #484f5e #5d6575`
- **Glass** `#1f3550 #3d6a96 #8cc4ea`
- Accents: red `#b03a32/#e0604a`, yellow `#b08a2a/#e8c547`, white `#f2f4f6`, flame `#ff9b2e/#ffe08a`
- **Team colour**: two mask tones (light/dark) tinted at runtime — tail fins, stripes, roundels, flags.

## 5. Silhouette rules
- Fighters: thin fuselage, clear wings, canopy glint, wingtip missiles.
- Stealth: faceted diamond wings, twin canted tails, gold canopy.
- Bombers: long fuselage + very long wings, visible engine pods.
- Helicopters: narrow body, long tail boom, rotor disc ~1.2× body.
- Carrier: flat angled deck, starboard island, painted runway lines.
- Destroyer/frigate: forward gun turret, VLS block, superstructure, aft helipad.
- Submarine: black cigar, sail forward of centre.
- Transport/cargo: colourful containers, bridge at the stern.
- Tanks: tracks both sides, round turret, long barrel.

## 6. World integration
- Cities, roads and facilities are **painted into the ground chunks**, not floated on top.
- Cities grow organically from the region centre, follow coastlines, never cover water or mountains.
- Borders: thin bright line + dark inner line; fill tint only when zoomed out.
- Numbers/labels: small, only where they help a decision.

## 7. Animation
- Rotors 6 frames, jets afterburner 2 frames, soldiers 3-frame walk, tank tracks 2 frames.
- Weapons: tracer lines, rocket/missile smoke trails, muzzle flashes, carpet bombs, explosions 8 frames.
- Aircraft take off from their airbase/carrier and return; nothing teleports.
