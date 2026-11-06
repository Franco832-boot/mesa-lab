import { componentDefinitions } from '../../model/components';
import { lcdGeometry, lcdWindow } from '../../model/lcd';
import type { LcdKind, LcdView } from '../../model/lcd';

/** One physical display renderer; state is supplied solely by the simulator. */
export function LcdArtwork({ kind, view }: { kind: LcdKind; view?: LcdView }) {
  const { columns, rows } = lcdGeometry(kind);
  const body = componentDefinitions[kind].physical.sourceBody;
  const window = lcdWindow(kind);
  const cellWidth = (window.width - 4) / columns, cellHeight = (window.height - 3) / rows;
  return <g data-testid="lcd-artwork" role="img" aria-label={`${columns}×${rows}: ${view?.lines.join(' / ') ?? ''}`}>
    <rect width={body.width} height={body.height} rx="1" fill="#167455" stroke="#165b46" strokeWidth=".5" />
    {[{ x: 3, y: 3 }, { x: body.width - 3, y: 3 }, { x: 3, y: body.height - 3 }, { x: body.width - 3, y: body.height - 3 }].map((point, index) =>
      <circle key={index} cx={point.x} cy={point.y} r="1.5" fill="#b1b8a4" stroke="#335d4b" strokeWidth=".4" />)}
    <rect x={window.x - 1.5} y={window.y - 1.5} width={window.width + 3} height={window.height + 3} rx="1" fill="#252e29" />
    <rect {...window} fill="#718166" data-testid="lcd-glass" data-backlight={view?.backlight ?? 0} />
    <rect {...window} fill="#b4d86b" opacity={view?.backlight ?? 0} />
    {Array.from({ length: rows }, (_, row) => <g key={row} data-lcd-row={row} aria-label={view?.lines[row] ?? ''}>
      {Array.from({ length: columns }, (_, column) => <g key={column} data-lcd-cell={`${column},${row}`}>
        <rect x={window.x + 2 + column * cellWidth} y={window.y + 1.5 + row * cellHeight} width={cellWidth * .8} height={cellHeight * .8} fill="#263d20" opacity=".035" />
        <text x={window.x + 2 + column * cellWidth} y={window.y + 1.5 + row * cellHeight + cellHeight * .72}
          fontSize={cellHeight * .8} textLength={cellWidth * .8} lengthAdjust="spacingAndGlyphs" fontFamily="monospace" fill="#243e23" opacity={view?.contrast ?? 0}>
          {view?.lines[row]?.[column] ?? ' '}
        </text>
        {view && view.cursorColumn === column && view.cursorRow === row && (view.cursor || view.blink) && <rect
          className={view.blink ? 'lcd-blink' : undefined} x={window.x + 2 + column * cellWidth}
          y={window.y + 1.5 + row * cellHeight + (view.blink ? 0 : cellHeight * .75)} width={cellWidth * .8}
          height={view.blink ? cellHeight * .8 : cellHeight * .08} fill="#243e23" opacity={view.contrast} />}
      </g>)}
    </g>)}
    {componentDefinitions[kind].sourcePins.map((pin) => <g key={pin.id}>
      <circle cx={pin.position.x} cy={pin.position.y} r=".85" fill="#cfbd74" stroke="#233f32" strokeWidth=".25" />
      <text x={pin.position.x} y="6.3" textAnchor="middle" fontSize="1" fill="#e3e7cd">{pin.id}</text>
    </g>)}
    <text x={body.width - 7} y="8.5" textAnchor="end" fontSize="1.5" fill="#d5dfcb">{columns}×{rows} · HD44780</text>
  </g>;
}
