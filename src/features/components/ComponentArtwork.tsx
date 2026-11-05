import { useId } from 'react';
import type { ElectronicComponent, ComponentKind } from '../../model/types';
import { artworkTransform, physicalSpecs, visualBounds } from '../../model/physical';
import { componentDefinitions, ledColors } from '../../model/components';
import { resistorBands } from './materials';
import type { ComponentResult } from '../../sim/types';
import { potentiometerAngle } from '../../model/potentiometer';

interface ComponentArtworkProps {
  kind: ComponentKind;
  properties?: ElectronicComponent['properties'];
  result?: ComponentResult;
  pressed?: boolean;
  wiperRatio?: number;
}

const numbers = (count: number) => Array.from({ length: count }, (_, i) => i);
const unoTop = componentDefinitions['arduino-uno'].sourcePins.slice(0, 18);
const unoBottom = componentDefinitions['arduino-uno'].sourcePins.slice(18, 32);
const espLeft = componentDefinitions.esp8266.sourcePins.slice(0, 15);
const espRight = componentDefinitions.esp8266.sourcePins.slice(15);

function Socket({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect
        x={x - 5.7}
        y={y - 5.7}
        width="11.4"
        height="11.4"
        rx="1"
        fill="#11191e"
        stroke="#526168"
        strokeWidth="0.7"
      />
      <path d={`M${x - 5} ${y + 5}v-10h10`} stroke="#718080" strokeWidth=".55" fill="none" />
      <rect x={x - 2.4} y={y - 2.4} width="4.8" height="4.8" rx=".6" fill="#b7a279" />
      <rect x={x - 1.2} y={y - 1.2} width="2.4" height="2.4" fill="#080d12" />
    </g>
  );
}
function HeaderPad({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 5.6} y={y - 5.6} width="11.2" height="11.2" rx="2" fill="#131d1f" />
      <circle cx={x} cy={y} r="4.3" fill="#b5a36a" />
      <circle cx={x} cy={y} r="3.1" fill="#b9c5bd" />
      <circle cx={x - 0.5} cy={y - 0.5} r="2.1" fill="#d3d9c9" />
      <rect x={x - 1} y={y - 1} width="2" height="2" fill="#777f73" />
    </g>
  );
}
function Vias({ board }: { board: 'arduino-uno' | 'esp8266' }) {
  const locations =
    board === 'arduino-uno'
      ? [
          { x: 41, y: 137 },
          { x: 58, y: 226 },
          { x: 188, y: 121 },
          { x: 210, y: 219 },
          { x: 293, y: 59 },
          { x: 113, y: 215 },
          { x: 62, y: 62 },
          { x: 287, y: 130 },
          { x: 51, y: 157 },
          { x: 310, y: 208 },
        ]
      : [
          { x: 38, y: 31 },
          { x: 130, y: 31 },
          { x: 39, y: 179 },
          { x: 128, y: 179 },
          { x: 44, y: 248 },
          { x: 127, y: 248 },
          { x: 58, y: 201 },
          { x: 110, y: 201 },
        ];
  return (
    <g>
      {locations.map((point) => (
        <g key={`${point.x}-${point.y}`}>
          <circle cx={point.x} cy={point.y} r="2" fill="#ac9e68" />
          <circle cx={point.x} cy={point.y} r=".9" fill="#203f3e" />
        </g>
      ))}
    </g>
  );
}
function Smd({ x, y, vertical = false }: { x: number; y: number; vertical?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${vertical ? 90 : 0})`}>
      <rect width="12" height="5" rx="0.8" fill="#b6b9b3" />
      <rect x="3" width="6" height="5" fill="#393d3d" />
    </g>
  );
}
function Mount({ x, y, dark = false }: { x: number; y: number; dark?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r="7" fill={dark ? '#9b9271' : '#99c9cc'} />
      <circle cx={x} cy={y} r="4.1" fill="#f4f5f5" stroke="#768b8b" strokeWidth="1.3" />
    </g>
  );
}
function Uno({ prefix }: { prefix: string }) {
  const body = physicalSpecs['arduino-uno'].sourceBody;
  return (
    <g>
      <defs>
        <linearGradient id={`${prefix}-pcb`} x2="1" y2="1">
          <stop stopColor="#137e91" />
          <stop offset="1" stopColor="#076476" />
        </linearGradient>
        <linearGradient id={`${prefix}-metal`} x2="0.2" y2="1">
          <stop stopColor="#e6e9e8" />
          <stop offset="0.45" stopColor="#a4afaf" />
          <stop offset="0.5" stopColor="#d9dfdc" />
          <stop offset="1" stopColor="#9ba5a6" />
        </linearGradient>
      </defs>
      <path
        d={`M${body.x + 8} ${body.y}H${body.x + body.width - 24}L${body.x + body.width} ${body.y + 25}V${body.y + body.height - 27}L${body.x + body.width - 18} ${body.y + body.height}H${body.x + 8}Q${body.x} ${body.y + body.height} ${body.x} ${body.y + body.height - 8}V${body.y + 8}Q${body.x} ${body.y} ${body.x + 8} ${body.y}Z`}
        fill={`url(#${prefix}-pcb)`}
        stroke="#065563"
        strokeWidth="2"
      />
      <g stroke="#2f9a9c" fill="none" strokeWidth="1.1" opacity="0.6">
        <path d="M60 45h92l35 35h104M79 61h54l45 45h112M91 218h38l30-30h135M47 198h50l54-54h132M175 49v35l31 31h85M304 49v22l-30 30M89 246h41l18-18h144M36 96h74l21 21v35" />
        <path d="M74 206v-30h28l35-35h144M89 111h22l44 44h140M155 207h151v-24M197 140V93l38-38" />
      </g>
      <Vias board="arduino-uno" />
      <path
        d="M10 3h312l24 24v216"
        fill="none"
        stroke="#ffffff"
        strokeOpacity=".13"
        strokeWidth="1.3"
      />
      <Mount x={22} y={18} />
      <Mount x={318} y={33} />
      <Mount x={318} y={247} />
      <Mount x={21} y={235} />
      <rect
        x="-9"
        y="57"
        width="67"
        height="62"
        rx="3"
        fill={`url(#${prefix}-metal)`}
        stroke="#7c8c90"
      />
      <path d="M-9 64H7v48H-9M-7 69H1v37h-8" stroke="#6e7b7e" fill="#444e52" />
      <rect x="20" y="61" width="26" height="54" rx="2" fill="none" stroke="#909e9f" />
      <path d="M21 65h23m-23 46h23" stroke="#e6e9e8" />
      <rect x="-3" y="171" width="56" height="38" rx="4" fill="#151a1e" />
      <rect x="-7" y="175" width="16" height="30" rx="3" fill="#242a2d" />
      <ellipse cx="-4" cy="190" rx="5" ry="12" fill="#0b1014" />
      <rect x="15" y="176" width="27" height="27" fill="#1c2326" />
      <rect x="67" y="77" width="43" height="43" fill="#263336" stroke="#b2c3c0" strokeWidth="1" />
      {numbers(8).map((i) => (
        <g key={i} fill="#bec8c1">
          <rect x={70 + i * 5} y="71" width="2" height="6" />
          <rect x={70 + i * 5} y="120" width="2" height="6" />
          <rect x="61" y={80 + i * 5} width="6" height="2" />
          <rect x="110" y={80 + i * 5} width="6" height="2" />
        </g>
      ))}
      <circle cx="74" cy="83" r="2" fill="#7e8a86" />
      <rect x="128" y="164" width="161" height="39" rx="2" fill="#101b20" stroke="#6d7d79" />
      {numbers(14).map((i) => (
        <g key={i}>
          <rect x={134 + i * 11} y="157" width="4" height="7" fill="#c9d0c4" />
          <rect x={134 + i * 11} y="203" width="4" height="8" fill="#c9d0c4" />
        </g>
      ))}
      <path d="M128 177a6 6 0 0 1 0 12" stroke="#4a5657" fill="none" />
      <circle cx="140" cy="173" r="2" fill="#74807a" />
      <text x="165" y="186" fill="#929f9a" fontSize="8" fontFamily="monospace">
        ATMEGA328P-PU
      </text>
      <rect x="80" y="144" width="31" height="13" rx="5" fill={`url(#${prefix}-metal)`} />
      <text x="85" y="153" fontSize="5" fill="#596b6b">
        16.000
      </text>
      <g>
        <rect x="59" y="36" width="22" height="24" fill="#dadfd4" stroke="#23393a" />
        <circle cx="70" cy="48" r="6.5" fill="#a99a83" />
        <text x="57" y="31" fontSize="6" fill="#dceee8">
          RESET
        </text>
      </g>
      {[
        { x: 67, y: 184 },
        { x: 91, y: 184 },
      ].map((p) => (
        <g key={p.x}>
          <ellipse cx={p.x} cy={p.y + 12} rx="9" ry="4" fill="#284c50" />
          <rect x={p.x - 8} y={p.y} width="16" height="14" fill="#a6b7b3" />
          <ellipse cx={p.x} cy={p.y} rx="8" ry="4" fill="#d4dbd6" />
          <path d={`M${p.x - 4} ${p.y}h8m-4-2v4`} stroke="#7b9391" />
        </g>
      ))}
      {numbers(12).map((i) => (
        <Smd
          key={i}
          x={127 + (i % 4) * 19}
          y={52 + Math.floor(i / 4) * 18}
          vertical={i % 3 === 0}
        />
      ))}
      <rect x="299" y="108" width="7" height="4" fill="#8f9b5c" stroke="#bec2b1" />
      <text x="310" y="112" fontSize="6" fill="#e8f5ed">
        ON
      </text>
      <rect x="68" y="130" width="7" height="4" fill="#c3ad68" />
      <text x="57" y="134" fontSize="6" fill="#e8f5ed">
        L
      </text>
      <g fill="#d3e9e3" fontFamily="Arial, sans-serif">
        <text x="221" y="95" fontWeight="700" fontSize="29" letterSpacing="1">
          UNO
        </text>
        <text x="222" y="112" fontSize="9" letterSpacing="2">
          R3 · 16 MHz
        </text>
        <text x="230" y="143" fontSize="7" letterSpacing="1">
          DIGITAL LAB
        </text>
        <text x="230" y="228" fontSize="6">
          ANALOG IN
        </text>
        <text x="108" y="228" fontSize="6">
          POWER
        </text>
      </g>
      {unoTop.map((pin) => (
        <g key={pin.id}>
          <Socket x={pin.position.x} y={pin.position.y} />
          <text
            x={pin.position.x + 2}
            y={pin.position.y + 20}
            fill="#d6e6df"
            fontSize="6.5"
            transform={`rotate(90 ${pin.position.x + 2} ${pin.position.y + 20})`}
          >
            {pin.label}
          </text>
        </g>
      ))}
      {unoBottom.map((pin) => (
        <g key={pin.id}>
          <Socket x={pin.position.x} y={pin.position.y} />
          <text
            x={pin.position.x + 2}
            y={pin.position.y - 14}
            fill="#d6e6df"
            fontSize="6"
            transform={`rotate(-90 ${pin.position.x + 2} ${pin.position.y - 14})`}
          >
            {pin.label}
          </text>
        </g>
      ))}
      <g>
        {componentDefinitions['arduino-uno'].sourcePins
          .filter((pin) => pin.id.startsWith('ICSP-'))
          .map((pin) => (
            <g key={pin.id}>
              <rect
                x={pin.position.x - 3}
                y={pin.position.y - 3}
                width="6"
                height="6"
                rx=".5"
                fill="#293b3a"
              />
              <rect
                x={pin.position.x - 1.5}
                y={pin.position.y - 1.5}
                width="3"
                height="3"
                fill="#c6bf93"
              />
            </g>
          ))}
      </g>
    </g>
  );
}
function Esp({ prefix }: { prefix: string }) {
  const body = physicalSpecs.esp8266.sourceBody;
  return (
    <g>
      <defs>
        <linearGradient id={`${prefix}-shield`} x2="1" y2="0.4">
          <stop stopColor="#b8c3c0" />
          <stop offset="0.45" stopColor="#e2e5de" />
          <stop offset="1" stopColor="#9ea9a8" />
        </linearGradient>
        <linearGradient id={`${prefix}-black`} x2="1" y2="1">
          <stop stopColor="#293638" />
          <stop offset="1" stopColor="#152427" />
        </linearGradient>
      </defs>
      <rect
        x={body.x}
        y={body.y}
        width={body.width}
        height={body.height}
        rx="9"
        fill={`url(#${prefix}-black)`}
        stroke="#0e1718"
        strokeWidth="2"
      />
      <g stroke="#36524b" strokeWidth="0.8" fill="none">
        {numbers(12).map((i) => (
          <path key={i} d={`M26 ${50 + i * 17}h${25 + (i % 4) * 10}l${12 + (i % 3) * 7} -14h48`} />
        ))}
      </g>
      <Vias board="esp8266" />
      <path d="M12 4h142q3 0 3 5v291" fill="none" stroke="#778478" strokeOpacity=".35" />
      <Mount x={24} y={16} dark />
      <Mount x={142} y={16} dark />
      <Mount x={24} y={302} dark />
      <Mount x={142} y={302} dark />
      <rect
        x="45"
        y="23"
        width="76"
        height="157"
        rx="2"
        fill="#4a6055"
        stroke="#bbad80"
        strokeWidth="1.5"
      />
      <path
        d="M52 32h12v12h10V32h10v12h10V32h10v24H52v9h57"
        fill="none"
        stroke="#d1b96e"
        strokeWidth="3"
      />
      <rect
        x="46"
        y="77"
        width="74"
        height="101"
        rx="2"
        fill={`url(#${prefix}-shield)`}
        stroke="#839591"
      />
      <rect x="50" y="81" width="66" height="92" rx="2" fill="none" stroke="#b1bab3" />
      <path d="M48 79h70v6H48Z" fill="#ffffff" opacity=".15" />
      <path d="M50 166h66v7H50Z" fill="#6e7e76" opacity=".12" />
      <g fill="#64726e" fontFamily="Arial, sans-serif" textAnchor="middle">
        <text x="83" y="107" fontSize="11" fontWeight="700">
          ESP-12E
        </text>
        <text x="83" y="120" fontSize="6.7" letterSpacing="1">
          WiFi MODULE
        </text>
        <text x="83" y="143" fontSize="13">
          CE
        </text>
        <text x="83" y="157" fontSize="5.8">
          2.4 GHz · ESP8266EX
        </text>
      </g>
      {numbers(8).map((i) => (
        <g key={i}>
          <rect x="41" y={82 + i * 12} width="5" height="6" fill="#c8b877" />
          <rect x="120" y={82 + i * 12} width="5" height="6" fill="#c8b877" />
        </g>
      ))}
      <rect
        x="66"
        y="208"
        width="34"
        height="33"
        fill="#11191b"
        stroke="#789087"
        strokeWidth="0.6"
      />
      <text x="72" y="226" fill="#788d85" fontSize="5">
        CP2102
      </text>
      {numbers(7).map((i) => (
        <g key={i} fill="#a6b4a8">
          <rect x={68 + i * 4} y="204" width="2" height="4" />
          <rect x={68 + i * 4} y="241" width="2" height="4" />
        </g>
      ))}
      {[194, 214, 238, 255].map((y, i) => (
        <g key={y}>
          <Smd x={45} y={y} vertical={i % 2 === 0} />
          <Smd x={112} y={y} />
        </g>
      ))}
      <rect x="42" y="268" width="20" height="18" rx="2" fill="#a5b2aa" />
      <rect x="47" y="272" width="10" height="10" rx="2" fill="#293435" />
      <text x="41" y="264" fontSize="5" fill="#d9e3d8">
        FLASH
      </text>
      <rect x="104" y="268" width="20" height="18" rx="2" fill="#a5b2aa" />
      <rect x="109" y="272" width="10" height="10" rx="2" fill="#293435" />
      <text x="105" y="264" fontSize="5" fill="#d9e3d8">
        RESET
      </text>
      <path d="M65 288h36v25H65Z" fill={`url(#${prefix}-shield)`} stroke="#899a95" />
      <path d="M69 313v-9h28v9" fill="#28312e" stroke="#abb9af" />
      <path d="M73 309h20" stroke="#bcad72" strokeWidth="2" />
      <text x="83" y="197" textAnchor="middle" fill="#d9e3d8" fontSize="7" letterSpacing="0.6">
        NodeMCU 1.0
      </text>
      {espLeft.map((pin) => (
        <g key={pin.id}>
          <HeaderPad x={pin.position.x} y={pin.position.y} />
          <text x={pin.position.x + 10} y={pin.position.y + 2} fill="#d4ded2" fontSize="5.8">
            {pin.label}
          </text>
        </g>
      ))}
      {espRight.map((pin) => (
        <g key={pin.id}>
          <HeaderPad x={pin.position.x} y={pin.position.y} />
          <text
            x={pin.position.x - 11}
            y={pin.position.y + 2}
            textAnchor="end"
            fill="#d4ded2"
            fontSize="5.8"
          >
            {pin.label}
          </text>
        </g>
      ))}
    </g>
  );
}
const holes = componentDefinitions.breadboard.sourcePins
  .filter((pin) => /^[a-j]\d+$/.test(pin.id))
  .map((pin) => `M${pin.position.x - 1.3} ${pin.position.y - 1.3}h2.6v2.6h-2.6Z`)
  .join(' ');
const railHoles = componentDefinitions.breadboard.sourcePins
  .filter((pin) => !/^[a-j]\d+$/.test(pin.id))
  .map((pin) => `M${pin.position.x - 1.3} ${pin.position.y - 1.3}h2.6v2.6h-2.6Z`)
  .join(' ');
function Breadboard() {
  const body = physicalSpecs.breadboard.sourceBody;
  const channelY = 37.3 + 4 * 6.25 + 18.75 / 2;
  return (
    <g>
      <rect
        x={body.x}
        y={body.y + 2}
        width={body.width}
        height={body.height}
        rx="5"
        fill="#d4d6d4"
        stroke="#bdbfbd"
      />
      <rect
        x={body.x}
        y={body.y}
        width={body.width}
        height={body.height}
        rx="5"
        fill="#f0f0e9"
        stroke="#c6c9c6"
      />
      <path
        d={`M${body.x + 3} 11h${body.width - 6}M${body.x + 3} 120h${body.width - 6}`}
        stroke="#de7771"
        strokeWidth="1.1"
      />
      <path
        d={`M${body.x + 3} 31h${body.width - 6}M${body.x + 3} 140h${body.width - 6}`}
        stroke="#6d9fb5"
        strokeWidth="1.1"
      />
      <path d={`M${body.x + 3} ${channelY}h${body.width - 6}`} stroke="#d8d9d2" strokeWidth="7" />
      <path
        d={`M${body.x + 3} ${channelY - 2}h${body.width - 6}`}
        stroke="#c3c8c3"
        strokeWidth="1"
      />
      <path d={holes} fill="#8f9693" stroke="#d2d3cb" strokeWidth="0.6" />
      <path d={railHoles} fill="#909793" />
      {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((v, i) => (
        <text
          key={v}
          x={body.x + 3}
          y={39.3 + i * 6.25 + (i >= 5 ? 12.5 : 0)}
          fontSize="5"
          fill="#8f9690"
        >
          {v}
        </text>
      ))}
      {numbers(63)
        .filter((i) => i === 0 || (i + 1) % 5 === 0 || i === 62)
        .map((i) => (
          <g key={i} fill="#8f9690" fontSize="4.4">
            <text x={30 + i * 6.25} y="33">
              {i + 1}
            </text>
            <text x={30 + i * 6.25} y="118">
              {i + 1}
            </text>
          </g>
        ))}
      <g fontSize="8">
        <text x={body.x + 3} y="21" fill="#cb6d69">
          +
        </text>
        <text x={body.x + 3} y="30" fill="#6f99ad">
          −
        </text>
        <text x={body.x + 3} y="129" fill="#cb6d69">
          +
        </text>
        <text x={body.x + 3} y="137" fill="#6f99ad">
          −
        </text>
      </g>
    </g>
  );
}
function BasicArtwork({
  kind,
  properties,
  result,
  pressed,
  wiperRatio,
}: ComponentArtworkProps) {
  const color = properties && 'color' in properties ? ledColors[properties.color] : ledColors.red;
  const voltage = properties && 'voltage' in properties ? properties.voltage : 5;
  const resistance = properties && 'resistance' in properties ? properties.resistance : 330;
  const bands = resistorBands(resistance);
  const ratio = wiperRatio ?? (properties && 'ratio' in properties ? properties.ratio : 0.5);
  const body = physicalSpecs[kind].sourceBody;
  const ledAnode = componentDefinitions.led.sourcePins[0]?.position.x ?? 28;
  const ledCathode = componentDefinitions.led.sourcePins[1]?.position.x ?? 49;
  const ledLegs = componentDefinitions.led.sourcePins;
  const resistorLegs = componentDefinitions.resistor.sourcePins;
  const buttonLegs = componentDefinitions.pushbutton.sourcePins;
  const potLegs = componentDefinitions.potentiometer.sourcePins;
  switch (kind) {
    case 'led':
      return (
        <g>
          <ellipse
            className="led-glow"
            data-testid="led-glow"
            cx="38" cy="28" rx="30" ry="32"
            fill={color}
            opacity={result?.brightness ?? 0}
            pointerEvents="none"
          />
          <path d={`M${ledAnode} 54V${ledLegs[0]?.position.y ?? 96}M${ledCathode} 54V${ledLegs[1]?.position.y ?? 96}`} stroke="#a9afab" strokeWidth="4" />
          <path
            d={`M15 49V${body.y + 23}a23 23 0 0 1 46 0V49Z`}
            fill={color}
            stroke={color}
            strokeWidth="2"
          />
          <ellipse cx="38" cy="50" rx={body.width / 2} ry="8" fill={color} />
          <path
            d={`M24 31V${body.y + 18}c0-8 6-12 9-12`}
            stroke="#ffffff"
            opacity="0.55"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M28 42h8V30h13v12" fill="none" stroke="#a76053" strokeWidth="3" />
          <ellipse
            className="led-emission" cx="38" cy="28" rx="16" ry="20"
            fill="#fff5c0" opacity={result?.brightness ?? 0} pointerEvents="none"
          />
        </g>
      );
    case 'resistor':
      return (
        <g>
          <path d={resistorLegs.map((pin, index) => `${index === 0 ? 'M' : 'L'}${pin.position.x} ${pin.position.y}`).join('')} stroke="#b8b9ad" strokeWidth="3" />
          <path
            d={`M35 ${body.y}h60l7 5v${body.height - 10}l-7 5H35l-7-5V${body.y + 5}Z`}
            className="resistor-body"
            fill="#d6bf92"
            stroke="#bba178"
          />
          {[41, 53, 68, 89].map((x, i) => (
            <path
              key={x}
              d={`M${x} ${body.y}v${body.height}`}
              stroke={bands[i]}
              strokeWidth={i === 3 ? 4 : 6}
            />
          ))}
          <path d="M34 15h60" stroke="#fff8e5" strokeOpacity=".25" strokeWidth="2" />
        </g>
      );
    case 'pushbutton':
      return (
        <g>
          <path d={buttonLegs.map((pin, index) => `${index % 2 === 0 ? 'M' : 'L'}${pin.position.x} ${pin.position.y}`).join('')} stroke="#a5a99d" strokeWidth="7" />
          <rect x="16" y="13" width="58" height="58" rx="5" fill="#3d4242" />
          <rect x="21" y="18" width="48" height="48" rx="3" fill="#bfc3b8" />
          <circle cx="45" cy="45" r="18" fill="#3c4140" />
          <circle className="pushbutton-cap" cx="45" cy="42" r="16" fill="#535957" transform={pressed ? 'translate(0 3)' : undefined} />
        </g>
      );
    case 'potentiometer':
      return (
        <g>
          <path d={potLegs.map((pin) => `M${pin.position.x} 60V${pin.position.y}`).join('')} stroke="#c3bd9f" strokeWidth="5" />
          <circle cx="45" cy="44" r="32" fill="#288da5" stroke="#216679" strokeWidth="3" />
          <circle cx="45" cy="40" r="23" fill="#c1c8c0" />
          <circle cx="45" cy="40" r="15" fill="#aab6ad" />
          <g data-testid="pot-indicator" transform={`rotate(${potentiometerAngle(ratio)} 45 40)`}>
            <path d="m35 50 20-20" stroke="#586f69" strokeWidth="5" />
          </g>
        </g>
      );
    case 'power-supply':
      return (
        <g>
          <rect
            x={body.x}
            y={body.y}
            width={body.width}
            height={body.height}
            rx="7"
            fill="#e1e4e1"
            stroke="#aeb8b2"
          />
          <rect x="17" y="16" width="81" height="40" rx="3" fill="#344f4b" />
          <text x="25" y="43" fontSize="24" fontFamily="monospace" fill="#8ec4a1">
            {voltage.toFixed(2)}
          </text>
          <circle cx="121" cy="36" r="12" fill="#a7b2a7" />
          <circle cx="29" cy="76" r="7" fill="#b95751" />
          <circle cx="55" cy="76" r="7" fill="#39403b" />
          <path d="M115 69h15m-15 6h15m-15 6h15" stroke="#a0aaa0" strokeWidth="2" />
        </g>
      );
    default:
      return null;
  }
}
/** SVG rendering consumes engine results; it never determines electrical behavior. */
function SourceArtwork({
  kind,
  properties,
  result,
  pressed,
  wiperRatio,
}: ComponentArtworkProps) {
  const prefix = useId().replaceAll(':', '');
  switch (kind) {
    case 'arduino-uno':
      return <Uno prefix={prefix} />;
    case 'esp8266':
      return <Esp prefix={prefix} />;
    case 'breadboard':
      return <Breadboard />;
    default:
      return <BasicArtwork kind={kind} {...(properties ? { properties } : {})}
        {...(result ? { result } : {})} {...(pressed !== undefined ? { pressed } : {})}
        {...(wiperRatio !== undefined ? { wiperRatio } : {})} />;
  }
}
/** Normalizes the original drawing to the shared physical world scale. */
export function ComponentArtwork({
  kind,
  properties,
  result,
  pressed,
  wiperRatio,
}: ComponentArtworkProps) {
  return (
    <g className="component-artwork" data-condition={result?.condition ?? 'normal'} transform={artworkTransform(kind)}>
      <SourceArtwork kind={kind} {...(properties ? { properties } : {})}
        {...(result ? { result } : {})} {...(pressed !== undefined ? { pressed } : {})}
        {...(wiperRatio !== undefined ? { wiperRatio } : {})} />
    </g>
  );
}
export function ComponentThumbnail({
  kind,
  className = '',
  properties,
  result,
  pressed,
  wiperRatio,
}: ComponentArtworkProps & { className?: string }) {
  const bounds = visualBounds(kind);
  return (
    <svg
      className={className}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      aria-hidden="true"
    >
      <ComponentArtwork kind={kind} {...(properties ? { properties } : {})}
        {...(result ? { result } : {})} {...(pressed !== undefined ? { pressed } : {})}
        {...(wiperRatio !== undefined ? { wiperRatio } : {})} />
    </svg>
  );
}
