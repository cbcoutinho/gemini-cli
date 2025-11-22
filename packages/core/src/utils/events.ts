/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'node:events';
import type { LoadServerHierarchicalMemoryResponse } from './memoryDiscovery.js';

export interface UserFeedbackPayload {
  message: string;
  severity: 'error' | 'warning' | 'info';
  error?: unknown;
}

export interface FallbackModeChangedPayload {
  isInFallbackMode: boolean;
}

export interface ModelChangedPayload {
  model: string;
}

/**
 * Payload for the 'console-log' event.
 */
export interface ConsoleLogPayload {
  type: 'log' | 'warn' | 'error' | 'debug' | 'info';
  content: string;
}

/**
 * Payload for the 'output' event.
 */
export interface OutputPayload {
  isStderr: boolean;
  chunk: Uint8Array | string;
  encoding?: BufferEncoding;
}

/**
 * Payload for the 'memory-changed' event.
 */
export type MemoryChangedPayload = LoadServerHierarchicalMemoryResponse;

export interface McpSamplingRequestPayload {
  serverName: string;
  prompt: unknown;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

export enum CoreEvent {
  UserFeedback = 'user-feedback',
  FallbackModeChanged = 'fallback-mode-changed',
  ModelChanged = 'model-changed',
  ConsoleLog = 'console-log',
  Output = 'output',
  MemoryChanged = 'memory-changed',
  McpSamplingRequest = 'mcp-sampling-request',
  ExternalEditorClosed = 'external-editor-closed',
}

export interface CoreEvents {
  [CoreEvent.UserFeedback]: [UserFeedbackPayload];
  [CoreEvent.FallbackModeChanged]: [FallbackModeChangedPayload];
  [CoreEvent.ModelChanged]: [ModelChangedPayload];
  [CoreEvent.ConsoleLog]: [ConsoleLogPayload];
  [CoreEvent.Output]: [OutputPayload];
  [CoreEvent.MemoryChanged]: [MemoryChangedPayload];
  [CoreEvent.McpSamplingRequest]: [McpSamplingRequestPayload];
  [CoreEvent.ExternalEditorClosed]: never[];
}

type EventBacklogItem = {
  [K in keyof CoreEvents]: {
    event: K;
    args: CoreEvents[K];
  };
}[keyof CoreEvents];

export class CoreEventEmitter extends EventEmitter<CoreEvents> {
  private _eventBacklog: EventBacklogItem[] = [];
  private static readonly MAX_BACKLOG_SIZE = 10000;

  constructor() {
    super();
  }

  private _emitOrQueue<K extends keyof CoreEvents>(
    event: K,
    ...args: CoreEvents[K]
  ): void {
    if (this.listenerCount(event) === 0) {
      if (this._eventBacklog.length >= CoreEventEmitter.MAX_BACKLOG_SIZE) {
        this._eventBacklog.shift();
      }
      this._eventBacklog.push({ event, args } as EventBacklogItem);
    } else {
      (
        this.emit as <K extends keyof CoreEvents>(
          event: K,
          ...args: CoreEvents[K]
        ) => boolean
      )(event, ...args);
    }
  }

  /**
   * Emits a user feedback event with the given severity and message.
   */
  emitFeedback(
    severity: 'error' | 'warning' | 'info',
    message: string,
    error?: unknown,
  ): void {
    const payload: UserFeedbackPayload = { severity, message, error };
    this._emitOrQueue(CoreEvent.UserFeedback, payload);
  }

  /**
   * Broadcasts a console log message.
   */
  emitConsoleLog(
    type: 'log' | 'warn' | 'error' | 'debug' | 'info',
    content: string,
  ): void {
    const payload: ConsoleLogPayload = { type, content };
    this._emitOrQueue(CoreEvent.ConsoleLog, payload);
  }

  /**
   * Broadcasts stdout/stderr output.
   */
  emitOutput(
    isStderr: boolean,
    chunk: Uint8Array | string,
    encoding?: BufferEncoding,
  ): void {
    const payload: OutputPayload = { isStderr, chunk, encoding };
    this._emitOrQueue(CoreEvent.Output, payload);
  }

  /**
   * Emits a fallback mode changed event.
   */
  emitFallbackModeChanged(isInFallbackMode: boolean): void {
    this.emit(CoreEvent.FallbackModeChanged, { isInFallbackMode });
  }

  /**
   * Emits a model changed event.
   */
  emitModelChanged(model: string): void {
    this.emit(CoreEvent.ModelChanged, { model });
  }

  /**
   * Emits an MCP sampling request event.
   */
  emitMcpSamplingRequest(payload: McpSamplingRequestPayload): void {
    this.emit(CoreEvent.McpSamplingRequest, payload);
  }

  /**
   * Drains the backlog of user feedback events that were emitted before a
   * listener was attached.
   *
   * This is useful for ensuring that feedback emitted during application
   * startup is not lost.
   */
  drainBacklogs(): void {
    const backlog = [...this._eventBacklog];
    this._eventBacklog.length = 0; // Clear in-place
    for (const item of backlog) {
      (
        this.emit as <K extends keyof CoreEvents>(
          event: K,
          ...args: CoreEvents[K]
        ) => boolean
      )(item.event, ...item.args);
    }
  }
}

export const coreEvents = new CoreEventEmitter();

export type { Client };
