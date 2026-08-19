/**
 * 前端事件总线(hostServices/eventBus)
 * - 替代 Wails runtime 的 EventsOn/EventsOff —— 纯前端 EventTarget 实现
 * - 兼容原调用签名:EventsOn(name, cb) / EventsOff(name) / EventsEmit(name, data)
 */

type Handler = (data: any) => void;

const registry = new Map<string, Set<Handler>>();
const emitter = new EventTarget();

/** 注册事件监听(返回注销函数) */
export function EventsOn(eventName: string, callback: Handler): () => void {
  const wrap = (e: Event) => callback((e as CustomEvent).detail);
  emitter.addEventListener(eventName, wrap);
  let handlers = registry.get(eventName);
  if (!handlers) {
    handlers = new Set();
    registry.set(eventName, handlers);
  }
  handlers.add(wrap);
  return () => emitter.removeEventListener(eventName, wrap);
}

/** 注销事件监听 */
export function EventsOff(eventName: string, ...additionalEventNames: string[]): void {
  [eventName, ...additionalEventNames].forEach((name) => {
    const handlers = registry.get(name);
    if (!handlers) return;
    handlers.forEach((h) => emitter.removeEventListener(name, h));
    handlers.clear();
    registry.delete(name);
  });
}

/** 注销全部事件监听 */
export function EventsOffAll(): void {
  registry.forEach((handlers, name) => {
    handlers.forEach((h) => emitter.removeEventListener(name, h));
  });
  registry.clear();
}

/** 派发事件 */
export function EventsEmit(eventName: string, ...args: unknown[]): void {
  emitter.dispatchEvent(new CustomEvent(eventName, { detail: args.length > 1 ? args : args[0] }));
}
