/**
 * 体素引擎契约（engine-contract）。
 *
 * 本文件是「脚手架 / UI 层」与「体素引擎实现」之间的冻结接口。
 * 常量与类型实际定义在 engine-ids.ts（避免与引擎实现产生循环依赖），
 * 本文件 re-export 全部内容并提供 createVoxelEngine 工厂。
 */
export * from './engine-ids';
import { Engine } from './engine/Engine';
import type { VoxelEngine, VoxelEngineOptions } from './engine-ids';

/**
 * 创建体素引擎（工厂）。
 *
 * 返回的实例同时是 `engine/Engine.ts` 的 `Engine`（VoxelEngine 的超集，
 * 含 HUD 需要的扩展只读接口：initProgress / getFps / getIconCanvas 等）。
 */
export function createVoxelEngine(
  canvas: HTMLCanvasElement,
  opts: VoxelEngineOptions
): VoxelEngine {
  return new Engine(canvas, opts);
}

// 仅用于类型重导出，避免下游重复 import types.ts 路径
export type { WorldSave, GameMode, Difficulty, WorldType, SoundMaterial } from './types';
