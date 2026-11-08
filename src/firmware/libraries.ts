/** Explicit API contracts; these adapters do not load or execute native C++ libraries. */
export interface MethodSignature { minArgs: number; maxArgs: number; result: 'float' | 'void' | 'text' }
export const libraryNames = ['DHT', 'Serial', 'LiquidCrystal', 'LiquidCrystal_I2C', 'Wire', 'ESP8266WebServer', 'LittleFS', 'WiFi'] as const;
export type LibraryClass = typeof libraryNames[number];
const lcdMethods: Readonly<Record<string, MethodSignature>> = {
    begin: { minArgs: 2, maxArgs: 2, result: 'void' }, clear: { minArgs: 0, maxArgs: 0, result: 'void' },
    home: { minArgs: 0, maxArgs: 0, result: 'void' }, setCursor: { minArgs: 2, maxArgs: 2, result: 'void' },
    print: { minArgs: 1, maxArgs: 2, result: 'void' }, write: { minArgs: 1, maxArgs: 1, result: 'void' },
    cursor: { minArgs: 0, maxArgs: 0, result: 'void' }, noCursor: { minArgs: 0, maxArgs: 0, result: 'void' },
    blink: { minArgs: 0, maxArgs: 0, result: 'void' }, noBlink: { minArgs: 0, maxArgs: 0, result: 'void' },
    display: { minArgs: 0, maxArgs: 0, result: 'void' }, noDisplay: { minArgs: 0, maxArgs: 0, result: 'void' },
  };
export const LIBRARIES: Record<LibraryClass, { header: string | null; constructorArity: number | null; methods: Readonly<Record<string, MethodSignature>> }> = {
  WiFi: { header: 'ESP8266WiFi.h', constructorArity: null, methods: {
    begin: { minArgs: 2, maxArgs: 2, result: 'void' }, status: { minArgs: 0, maxArgs: 0, result: 'float' },
    localIP: { minArgs: 0, maxArgs: 0, result: 'text' }, disconnect: { minArgs: 0, maxArgs: 0, result: 'void' },
  } },
  ESP8266WebServer: { header: 'ESP8266WebServer.h', constructorArity: 1, methods: {
    on: { minArgs: 2, maxArgs: 3, result: 'void' },
    serveStatic: { minArgs: 3, maxArgs: 3, result: 'void' },
    begin: { minArgs: 0, maxArgs: 0, result: 'void' },
    handleClient: { minArgs: 0, maxArgs: 0, result: 'void' },
    streamFile: { minArgs: 2, maxArgs: 2, result: 'void' },
    send: { minArgs: 3, maxArgs: 3, result: 'void' },
  } },
  LittleFS: { header: 'LittleFS.h', constructorArity: null, methods: { begin: { minArgs: 0, maxArgs: 0, result: 'void' } } },
  LiquidCrystal: { header: 'LiquidCrystal.h', constructorArity: 6, methods: lcdMethods },
  LiquidCrystal_I2C: { header: 'LiquidCrystal_I2C.h', constructorArity: 3, methods: { ...lcdMethods, init: { minArgs: 0, maxArgs: 0, result: 'void' }, backlight: { minArgs: 0, maxArgs: 0, result: 'void' }, noBacklight: { minArgs: 0, maxArgs: 0, result: 'void' } } },
  Wire: { header: 'Wire.h', constructorArity: null, methods: { begin: { minArgs: 0, maxArgs: 0, result: 'void' } } },
  DHT: { header: 'DHT.h', constructorArity: 2, methods: { begin: { minArgs: 0, maxArgs: 0, result: 'void' },
    readTemperature: { minArgs: 0, maxArgs: 0, result: 'float' }, readHumidity: { minArgs: 0, maxArgs: 0, result: 'float' } } },
  Serial: { header: null, constructorArity: null, methods: { begin: { minArgs: 1, maxArgs: 1, result: 'void' },
    print: { minArgs: 1, maxArgs: 2, result: 'void' }, println: { minArgs: 0, maxArgs: 2, result: 'void' } } },
};
export function isLibraryClass(name: string): name is LibraryClass { return Object.hasOwn(LIBRARIES, name); }
export function methodSignature(type: LibraryClass, name: string): MethodSignature | undefined {
  return Object.hasOwn(LIBRARIES[type].methods, name) ? LIBRARIES[type].methods[name] : undefined;
}
