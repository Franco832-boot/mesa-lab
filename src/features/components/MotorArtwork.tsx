import type { ElectronicComponent } from '../../model/types';
import type { ComponentResult } from '../../sim/types';
import { componentDefinitions } from '../../model/components';

export function MotorArtwork({ result }: { result?: ComponentResult }) {
  const direction = result?.motor?.direction ?? 'stopped';
  const speed = result?.motor?.speed ?? 0;
  const rotating = speed > 0 && (direction === 'forward' || direction === 'reverse');
  return <g data-testid="motor-artwork" data-direction={direction} data-speed={speed}>
    <path d="M5 25v5M19 25v5" stroke="#b99856" strokeWidth="1.4" />
    <rect y="5" width="24" height="22" rx="4" fill="#aeb8b4" stroke="#657672" strokeWidth=".5" />
    <path d="M2 10v12M22 10v12" stroke="#dce2de" strokeWidth="1.2" />
    <rect x="5" y="23" width="14" height="5" rx="1" fill="#344d47" />
    <circle cx="12" cy="11" r="10" fill="#d8ded9" stroke="#7b8a84" strokeWidth=".6" />
    <circle cx="12" cy="11" r="7.4" fill="#9eada5" stroke="#73857c" strokeWidth=".4" />
    {[4, 20].map((x) => <circle key={x} cx={x} cy="11" r=".8" fill="#5f7269" />)}
    <g transform="translate(12 11)">
      <g data-testid="motor-shaft" data-direction={direction} className={rotating ? 'motor-shaft is-rotating' : 'motor-shaft'}
        style={{ animationDuration: `${.5 / Math.max(.1, speed)}s`, animationDirection: direction === 'reverse' ? 'reverse' : 'normal' }}>
        <circle r="4.5" fill="#c2b07f" stroke="#7b734f" strokeWidth=".5" />
        <path d="M-1-4h2v7h-2Z" fill="#5c6354" />
        <circle cx="0" cy="-3" r=".7" fill="#f4edd4" />
      </g>
    </g>
    <text x="12" y="21.8" textAnchor="middle" fontSize="2.2" fill="#2d4940">DC</text>
    <text x="5" y="32" textAnchor="middle" fontSize="2" fill="#9a5147">+</text>
    <text x="19" y="32" textAnchor="middle" fontSize="2" fill="#3c5149">−</text>
  </g>;
}

export function L293dArtwork() {
  return <g data-testid="l293d-artwork">
    {componentDefinitions.l293d.sourcePins.map((pin, index) => <g key={pin.id}>
      <path d={`M${pin.position.x} ${index < 8 ? 5.8 : .5}V${pin.position.y}`} stroke="#b6bcb2" strokeWidth=".65" />
      <text x={pin.position.x} y={index < 8 ? 5.7 : 1.35} textAnchor="middle" fontSize=".85" fill="#eef0d8">{index + 1}</text>
    </g>)}
    <rect width="19.8" height="6.35" rx=".5" fill="#263731" stroke="#14251e" strokeWidth=".3" />
    <path d="M0 2a1.2 1.2 0 0 1 0 2.4" fill="#53635a" />
    <circle cx="1.25" cy="5" r=".4" fill="#b7c1a6" />
    <text x="10" y="3.8" textAnchor="middle" fontSize="1.9" fill="#dae3ce">L293D</text>
    {componentDefinitions.l293d.sourcePins.map((pin, index) => <text key={pin.id}
      x={pin.position.x} y={index < 8 ? 5.8 : 1.2} textAnchor="middle" fontSize=".8" fill="#aebba6">{index + 1}</text>)}
  </g>;
}

export function BatteryArtwork({ properties }: { properties?: ElectronicComponent['properties'] }) {
  const voltage = properties && 'voltage' in properties ? properties.voltage : 9;
  return <g data-testid="battery-artwork">
    <rect x="1.5" y="-1" width="23.5" height="7" rx="2" fill="#b8c2b9" stroke="#728477" strokeWidth=".4" />
    <circle cx="7" cy="-2" r="2.2" fill="#e5e5d7" stroke="#748779" strokeWidth=".5" />
    <path d="m17-3.7 2.5-1 2.5 1v3.4l-2.5 1-2.5-1Z" fill="#d0d5c9" stroke="#748779" strokeWidth=".5" />
    <rect width="26.5" height="48.5" rx="2" fill="#e4dec8" stroke="#8f9b85" strokeWidth=".5" />
    <path d="M.3 12h25.9v34q0 2.2-2.2 2.2H2.5q-2.2 0-2.2-2.2Z" fill="#345f4d" />
    <path d="M2 3v42" stroke="#faf5df" strokeWidth=".8" opacity=".6" />
    <text x="6.7" y="7.2" textAnchor="middle" fontSize="4" fill="#a34e42">+</text>
    <text x="19.5" y="7.2" textAnchor="middle" fontSize="4" fill="#324b3b">−</text>
    <image href="/losprofesparavos-isotype.png" x="6.25" y="15" width="14" height="14" />
    <text x="13.25" y="33" textAnchor="middle" fontSize="3" fontWeight="700" fill="#f8efd6">Los Profes</text>
    <text x="13.25" y="37" textAnchor="middle" fontSize="3" fontWeight="700" fill="#f8efd6">Para Vos</text>
    <text x="13.25" y="44.5" textAnchor="middle" fontSize="4.3" fontWeight="700" fill="#dfc781">{voltage} V</text>
  </g>;
}
