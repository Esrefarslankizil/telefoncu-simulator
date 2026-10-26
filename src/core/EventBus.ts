type EventListener<TPayload> = (payload: TPayload) => void;
type AnyEventListener = (payload: never) => void;
export type Unsubscribe = () => void;

/** A small synchronous event bus whose event names and payloads are type checked. */
export class EventBus<TEvents extends object> {
  private readonly listeners = new Map<keyof TEvents, Set<AnyEventListener>>();

  public on<TKey extends keyof TEvents>(
    eventName: TKey,
    listener: EventListener<TEvents[TKey]>,
  ): Unsubscribe {
    let eventListeners = this.listeners.get(eventName);

    if (eventListeners === undefined) {
      eventListeners = new Set<AnyEventListener>();
      this.listeners.set(eventName, eventListeners);
    }

    const typedListener: AnyEventListener = (payload) => {
      listener(payload as TEvents[TKey]);
    };

    eventListeners.add(typedListener);

    return () => {
      const currentListeners = this.listeners.get(eventName);
      currentListeners?.delete(typedListener);

      if (currentListeners?.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  public once<TKey extends keyof TEvents>(
    eventName: TKey,
    listener: EventListener<TEvents[TKey]>,
  ): Unsubscribe {
    let unsubscribe = (): void => {};
    const onceListener: EventListener<TEvents[TKey]> = (payload) => {
      unsubscribe();
      listener(payload);
    };

    unsubscribe = this.on(eventName, onceListener);
    return unsubscribe;
  }

  public emit<TKey extends keyof TEvents>(
    eventName: TKey,
    payload: TEvents[TKey],
  ): void {
    const eventListeners = this.listeners.get(eventName);

    if (eventListeners === undefined) {
      return;
    }

    for (const listener of eventListeners) {
      listener(payload as never);
    }
  }

  public clear(eventName?: keyof TEvents): void {
    if (eventName === undefined) {
      this.listeners.clear();
      return;
    }

    this.listeners.delete(eventName);
  }
}
