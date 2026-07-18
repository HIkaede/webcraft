/**
 * MC 共享组件库（design.md §9）——统一出口。
 * 外观均为像素风（硬阴影、无圆角），尺寸以逻辑像素 u（var(--u)）计。
 */
export { default as MCButton } from './MCButton';
export type { MCButtonProps } from './MCButton';
export { default as MCScreen } from './MCScreen';
export type { MCScreenProps, MCScreenBg } from './MCScreen';
export { default as MCLogo } from './MCLogo';
export type { MCLogoProps } from './MCLogo';
export { SPLASH_POOL, holidaySplash, isMinceraftSession, pickSplash } from './splash';
export { default as MCTextInput } from './MCTextInput';
export type { MCTextInputProps } from './MCTextInput';
export { default as MCCycleButton } from './MCCycleButton';
export type { MCCycleButtonProps, MCCycleOption } from './MCCycleButton';
export { default as MCSlider } from './MCSlider';
export type { MCSliderProps } from './MCSlider';
export { default as MCDialog } from './MCDialog';
export type { MCDialogProps, MCDialogButton } from './MCDialog';
export { default as MCTooltip } from './MCTooltip';
export type { MCTooltipProps } from './MCTooltip';
export { default as MCScrollbar } from './MCScrollbar';
export type { MCScrollbarProps, MCScrollbarHandle } from './MCScrollbar';
export { default as Panorama } from './Panorama';
export type { PanoramaProps } from './Panorama';
