import type { TranslationKey } from '../../locales/es/messages';
import type {
  ComponentCondition,
  DiagnosticCode,
  PinResult,
  SimulationIssue,
} from '../../sim/types';
import type { UnoErrorCode } from '../../firmware/uno';

export const firmwareErrorMessages: Record<UnoErrorCode, TranslationKey> = {
  'wifi-disconnected': 'firmwareWifiDisconnected',
  'indeterminate-read': 'firmwareIndeterminateRead',
  'missing-file': 'firmwareMissingFile',
  'include-cycle': 'firmwareIncludeCycle',
  'http-handler-limit': 'firmwareHttpLimit',
  'unsupported-syntax': 'firmwareSyntaxError',
  'invalid-value': 'firmwareValueError',
  'source-limit': 'firmwareSourceLimit',
  'instruction-limit': 'firmwareInstructionLimit',
  'step-limit': 'firmwareStepLimit',
  'pin-not-output': 'firmwareModeError',
  'name-error': 'firmwareNameError',
  'type-error': 'firmwareTypeError',
  'arithmetic-error': 'firmwareArithmeticError',
  'nesting-limit': 'firmwareNestingLimit',
};

export const conditionMessages: Record<ComponentCondition, TranslationKey> = {
  normal: 'conditionNormal',
  active: 'conditionActive',
  warning: 'conditionWarning',
  overheated: 'conditionOverheated',
  damaged: 'conditionDamaged',
};
export const diagnosticMessages: Record<DiagnosticCode, TranslationKey> = {
  'driver-supply': 'diagnosticDriverSupply',
  'driver-input': 'diagnosticDriverInput',
  'driver-overcurrent': 'diagnosticDriverCurrent',
  'motor-overload': 'diagnosticMotorOverload',
  'battery-overcurrent': 'diagnosticBatteryCurrent',
  'battery-sag': 'diagnosticBatterySag',
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
