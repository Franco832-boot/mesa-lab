/** Typed signatures are the extension point for future peripherals and libraries. */
export const GPIO_BUILTINS = {
  pinMode: { arity: 2 }, digitalWrite: { arity: 2 }, delay: { arity: 1 }, delayMicroseconds: { arity: 1 },
} as const;
export const CLOCK_BUILTINS = { millis: { divisorUs: 1000 }, micros: { divisorUs: 1 } } as const;
export type GpioCall = keyof typeof GPIO_BUILTINS;
export type ClockCall = keyof typeof CLOCK_BUILTINS;
export function isGpioCall(name: string): name is GpioCall { return Object.hasOwn(GPIO_BUILTINS, name); }
export function isClockCall(name: string): name is ClockCall { return Object.hasOwn(CLOCK_BUILTINS, name); }
