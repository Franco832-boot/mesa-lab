import type { TranslationKey } from '../../locales/es/messages';
import type { ComponentCondition, DiagnosticCode, PinResult, SimulationIssue } from '../../sim/types';

export const conditionMessages: Record<ComponentCondition, TranslationKey> = {
  normal: 'conditionNormal',
  active: 'conditionActive',
  warning: 'conditionWarning',
  overheated: 'conditionOverheated',
  damaged: 'conditionDamaged',
};
export const diagnosticMessages: Record<DiagnosticCode, TranslationKey> = {
  'invalid-reference': 'diagnosticInvalidReference',
  'invalid-input': 'diagnosticInvalidInput',
  'disconnected-component': 'diagnosticDisconnected',
  'open-circuit': 'diagnosticOpenCircuit',
  'floating-node': 'diagnosticFloating',
  'short-circuit': 'diagnosticShort',
  'contradictory-sources': 'diagnosticSources',
  'unsupported-network': 'diagnosticUnsupported',
  'reverse-polarity': 'diagnosticReverse',
  'led-overcurrent': 'diagnosticLedCurrent',
  'resistor-overpower': 'diagnosticResistorPower',
  'gpio-overcurrent': 'diagnosticGpioCurrent',
  'gpio-overvoltage': 'diagnosticGpioVoltage',
  'boot-sensitive-pin': 'diagnosticBootPin',
  'unsupported-pin': 'diagnosticUnsupportedPin',
};
export const statusMessages: Record<'stopped' | 'running' | 'paused', TranslationKey> = {
  stopped: 'notSimulating',
  running: 'simulationRunning',
  paused: 'simulationPaused',
};
export const logicMessages: Record<PinResult['logic'], TranslationKey> = {
  HIGH: 'logicHigh',
  LOW: 'logicLow',
  FLOATING: 'logicFloating',
  CONFLICT: 'logicConflict',
  UNDEFINED: 'logicUndefined',
};
export const severityMessages: Record<SimulationIssue['severity'], TranslationKey> = {
  info: 'severityInfo',
  warning: 'severityWarning',
  error: 'severityError',
};
