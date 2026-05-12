// =====================================================================
// Mode catalog for the @deck.gl-community/editable-layers Advanced demo.
//
// Source of truth (upstream React example):
//   https://github.com/visgl/deck.gl-community/blob/master/examples/editable-layers/advanced/src/example.tsx
//
// Each entry pairs the upstream display label with the corresponding
// mode constructor exported from `@deck.gl-community/editable-layers`.
//
// `ViewMode` and the various draw modes are passed to
// `EditableGeoJsonLayer.props.mode` as the *class* (not an instance).
// `SnappableMode` and `CompositeMode` need to be instantiated with one
// or more inner modes — those entries pre-build the instance.
// =====================================================================
import {
	// view / measure
	ViewMode,
	MeasureDistanceMode,
	MeasureAreaMode,
	MeasureAngleMode,
	// draw
	DrawPointMode,
	DrawLineStringMode,
	DrawPolygonMode,
	Draw90DegreePolygonMode,
	DrawPolygonByDraggingMode,
	DrawRectangleMode,
	DrawRectangleFromCenterMode,
	DrawRectangleUsingThreePointsMode,
	DrawSquareMode,
	DrawSquareFromCenterMode,
	DrawCircleFromCenterMode,
	DrawCircleByDiameterMode,
	DrawEllipseByBoundingBoxMode,
	DrawEllipseUsingThreePointsMode,
	// alter
	ModifyMode,
	ResizeCircleMode,
	ElevationMode,
	TranslateMode,
	RotateMode,
	ScaleMode,
	DuplicateMode,
	ExtendLineStringMode,
	ExtrudeMode,
	SplitPolygonMode,
	TransformMode,
	// composite / snappable
	SnappableMode,
	CompositeMode
} from '@deck.gl-community/editable-layers';

export type ModeEntry = {
	/** Stable id used as the React-style key in the mode picker. */
	id: string;
	/** Human-readable label, mirrors upstream. */
	label: string;
	/** Either a mode class (the layer instantiates it per-render)
	 *  or a pre-built mode instance (Snappable/Composite). */
	mode: unknown;
};

export type ModeCategory = {
	id: string;
	label: string;
	modes: ModeEntry[];
};

/** Categorized list, mirrors `categories` in upstream `example.tsx`. */
export const MODE_CATEGORIES: ModeCategory[] = [
	{
		id: 'view',
		label: 'View',
		modes: [
			{ id: 'view', label: 'View', mode: ViewMode },
			{ id: 'measure-distance', label: 'Measure Distance', mode: MeasureDistanceMode },
			{ id: 'measure-area', label: 'Measure Area', mode: MeasureAreaMode },
			{ id: 'measure-angle', label: 'Measure Angle', mode: MeasureAngleMode }
		]
	},
	{
		id: 'draw',
		label: 'Draw',
		modes: [
			{ id: 'draw-point', label: 'Draw Point', mode: DrawPointMode },
			{ id: 'draw-line-string', label: 'Draw LineString', mode: DrawLineStringMode },
			{ id: 'draw-polygon', label: 'Draw Polygon', mode: DrawPolygonMode },
			{
				id: 'draw-90deg-polygon',
				label: 'Draw 90° Polygon',
				mode: Draw90DegreePolygonMode
			},
			{
				id: 'draw-polygon-by-dragging',
				label: 'Draw Polygon By Dragging',
				mode: DrawPolygonByDraggingMode
			},
			{ id: 'draw-rectangle', label: 'Draw Rectangle', mode: DrawRectangleMode },
			{
				id: 'draw-rectangle-from-center',
				label: 'Draw Rectangle From Center',
				mode: DrawRectangleFromCenterMode
			},
			{
				id: 'draw-rectangle-using-three-points',
				label: 'Draw Rectangle Using 3 Points',
				mode: DrawRectangleUsingThreePointsMode
			},
			{ id: 'draw-square', label: 'Draw Square', mode: DrawSquareMode },
			{
				id: 'draw-square-from-center',
				label: 'Draw Square From Center',
				mode: DrawSquareFromCenterMode
			},
			{
				id: 'draw-circle-from-center',
				label: 'Draw Circle From Center',
				mode: DrawCircleFromCenterMode
			},
			{
				id: 'draw-circle-by-diameter',
				label: 'Draw Circle By Diameter',
				mode: DrawCircleByDiameterMode
			},
			{
				id: 'draw-ellipse-by-bounding-box',
				label: 'Draw Ellipse By Bounding Box',
				mode: DrawEllipseByBoundingBoxMode
			},
			{
				id: 'draw-ellipse-using-three-points',
				label: 'Draw Ellipse Using 3 Points',
				mode: DrawEllipseUsingThreePointsMode
			}
		]
	},
	{
		id: 'alter',
		label: 'Alter',
		modes: [
			{ id: 'modify', label: 'Modify', mode: ModifyMode },
			{ id: 'resize-circle', label: 'Resize Circle', mode: ResizeCircleMode },
			{ id: 'elevation', label: 'Elevation', mode: ElevationMode },
			{
				id: 'translate-snap',
				label: 'Translate (Snappable)',
				// `as any` — upstream @deck.gl-community/editable-layers 9.3.2 typings
				// for SnappableMode/CompositeMode declare the inner mode as
				// `GeoJsonEditMode` (with a SimpleFeatureCollection variant) but the
				// concrete mode classes use the wider FeatureCollection variant.
				mode: new SnappableMode(new TranslateMode() as any)
			},
			{ id: 'rotate', label: 'Rotate', mode: RotateMode },
			{ id: 'scale', label: 'Scale', mode: ScaleMode },
			{ id: 'duplicate', label: 'Duplicate', mode: DuplicateMode },
			{
				id: 'extend-line-string',
				label: 'Extend LineString',
				mode: ExtendLineStringMode
			},
			{ id: 'extrude', label: 'Extrude', mode: ExtrudeMode },
			{ id: 'split-polygon', label: 'Split Polygon', mode: SplitPolygonMode },
			{
				id: 'transform-snap',
				label: 'Transform (Snappable)',
				mode: new SnappableMode(new TransformMode() as any)
			}
		]
	},
	{
		id: 'composite',
		label: 'Composite',
		modes: [
			{
				id: 'draw-line-string-and-modify',
				label: 'Draw LineString + Modify',
				mode: new CompositeMode([
					new DrawLineStringMode() as any,
					new ModifyMode() as any
				])
			}
		]
	}
];

/** Flat list, useful for dropdown-style pickers. */
export const ALL_MODES: ModeEntry[] = MODE_CATEGORIES.flatMap((c) => c.modes);
