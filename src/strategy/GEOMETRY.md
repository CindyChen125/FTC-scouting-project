# BIOBUZZ field geometry for Strategy Sandbox

Coordinate system: inches from the top-left inside field corner when viewed from above with the scoring side at the top and the audience at the bottom. Red is left; blue is right. The field's inside boundary is `(0, 0)` to `(144, 144)`. One tile is nominally 24 inches. `fieldGeometry.ts` is the single source for dimensions and positions.

Verified measurements from FIRST's current Competition Manual §9 (TU06) and Event Field Setup Guide V1.0:

- Inside field: approximately 144 × 144 in, six tiles per side.
- Central frame: 49.46 in wide × 38.95 in deep, centered on the field.
- Red and blue hive pivot center lines: 25.5 in apart.
- A hive cell opening is approximately 20 in wide; cell structure is approximately 12 in deep. The two cells of a hive have an 18.84 in gap in Figure 9-9.
- Loading zones: approximately 23 in along the wall × 11 in into the field. Red is on the upper-left wall, blue on the lower-right wall.
- Gardens: approximately 23 × 2 in, at the lower-left red and upper-right blue corners.
- Alliance areas: approximately 97 in along the wall × 54 in deep outside the field.
- Four flowers attach to the perimeter, at top/red, left/red, right/blue, and bottom/blue. Their 4 in top openings are represented as rings.
- Initial hive tilt: red audience-side cell up; blue scoring-side cell up (Event Field Setup Guide §11.1).
- Robot initial configuration maximum: 18 × 18 in (Competition Manual R102). Stage 1 uses editable 16 × 16 in planning footprints. Match-start robots must touch their own perimeter wall, stay on their own side, and avoid flowers and loading zones (G304); the four default placements follow this, but are not official fixed starting coordinates.

**Nominal diagram placements:** The flower center coordinates (48,0), (0,96), (144,48), and (96,144), plus each hive cell's top-down footprint, are interpreted from FIRST's diagrams. FIRST explicitly says manual illustrations are for general understanding and dimensions are nominal, with a usual ±1 in tolerance. These placements are labeled as nominal in the UI and should not be used for robot localization or a legal clearance check. A later CAD-based survey can refine them without changing the rendering code.

Sources:

- [FIRST Competition Manual §9, TU06](https://ftc-resources.firstinspires.org/ftc/game/manual-09)
- [FIRST Competition Manual §10, TU10](https://ftc-resources.firstinspires.org/ftc/game/manual-10)
- [FIRST Competition Manual §11, TU09](https://ftc-resources.firstinspires.org/ftc/game/manual-11)
- [FIRST Competition Manual §12, TU08](https://ftc-resources.firstinspires.org/ftc/game/manual-12)
- [FIRST Event Field Setup Guide, V1.0](https://ftc-resources.firstinspires.org/ftc/archive/2027/field/eventfieldguide)
