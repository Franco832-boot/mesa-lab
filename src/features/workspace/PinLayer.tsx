import { memo, useRef, useState } from 'react';
import type { ComponentKind, PinReference } from '../../model/types';
import { componentDefinitions } from '../../model/components';
import { useLocale } from '../../locales/useLocale';

export const PinLayer = memo(function PinLayer({
  kind,
  componentId,
  activePin,
  onPick,
}: {
  kind: ComponentKind;
  componentId: string;
  activePin: string | null;
  onPick: (reference: PinReference) => void;
}) {
  const { t } = useLocale();
  const pins = componentDefinitions[kind].pins;
  const [focused, setFocused] = useState(0);
  const [showFocus, setShowFocus] = useState(false);
  const ref = useRef<SVGGElement>(null);
  const pin = pins[focused];
  return (
    <g
      ref={ref}
      className="pin-layer"
      role="group"
      tabIndex={0}
      aria-label={`${t('pins')} · ${pin?.label ?? ''}. ${t('pinKeyboard')}`}
      onFocus={() => setShowFocus(true)}
      onBlur={() => setShowFocus(false)}
      onKeyDown={(event) => {
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          setFocused(
            (value) =>
              (value +
                (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : pins.length - 1)) %
              pins.length,
          );
        }
        if ((event.key === 'Enter' || event.key === ' ') && pin) {
          event.preventDefault();
          event.stopPropagation();
          onPick({ componentId, pinId: pin.id });
        }
      }}
    >
      {pins.map((item, i) => (
        <circle
          key={item.id}
          data-pin={item.id}
          data-owner={componentId}
          cx={item.position.x}
          cy={item.position.y}
          r={4.5}
          className={`pin-target ${activePin === item.id ? 'origin-pin' : ''} ${showFocus && i === focused ? 'focused-pin' : ''}`}
        >
          <title>{`${item.label} · ${item.id}${item.gpio !== undefined ? ` · GPIO${item.gpio}` : ''}${item.bootLevel ? ` · ${t('boot')} ${item.bootLevel}` : ''}`}</title>
        </circle>
      ))}
    </g>
  );
});
