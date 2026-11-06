/** Explicit API contracts; these adapters do not load or execute native C++ libraries. */
export interface MethodSignature { minArgs: number; maxArgs: number; result: 'float' | 'void' }
export const libraryNames = ['DHT', 'Serial'] as const;
export type LibraryClass = typeof libraryNames[number];
export const LIBRARIES: Record<LibraryClass, { header: string | null; constructorArity: number | null; methods: Readonly<Record<string, MethodSignature>> }> = {
  DHT: { header: 'DHT.h', constructorArity: 2, methods: { begin: { minArgs: 0, maxArgs: 0, result: 'void' },
    readTemperature: { minArgs: 0, maxArgs: 0, result: 'float' }, readHumidity: { minArgs: 0, maxArgs: 0, result: 'float' } } },
  Serial: { header: null, constructorArity: null, methods: { begin: { minArgs: 1, maxArgs: 1, result: 'void' },
    print: { minArgs: 1, maxArgs: 2, result: 'void' }, println: { minArgs: 0, maxArgs: 2, result: 'void' } } },
};
export function isLibraryClass(name: string): name is LibraryClass { return Object.hasOwn(LIBRARIES, name); }
export function methodSignature(type: LibraryClass, name: string): MethodSignature | undefined {
  return Object.hasOwn(LIBRARIES[type].methods, name) ? LIBRARIES[type].methods[name] : undefined;
}
