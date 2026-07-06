/**
 * Event Queue — single-priority FIFO queue (Sprint 28)
 *
 * Cada fila é independente. Operações amortizadas O(1).
 * Eventos armazenados são imutáveis (frozen).
 *
 * Suporta maxSize opcional para controle de overflow.
 */

export function createQueue(name, maxSize) {
  let _items = [];
  let _head = 0;
  const _max = typeof maxSize === "number" && maxSize > 0 ? maxSize : 0;
  let _rejectedCount = 0;

  return Object.freeze({
    name,
    get maxSize() {
      return _max;
    },
    enqueue(event) {
      if (!event || !event.eventId) return false;
      if (_max > 0 && _items.length - _head >= _max) {
        _rejectedCount++;
        return false;
      }
      _items.push(event);
      return true;
    },
    dequeue() {
      if (_head >= _items.length) return null;
      const event = _items[_head];
      _items[_head] = undefined;
      _head++;
      if (_head > 0 && _head * 2 >= _items.length) {
        _items = _items.slice(_head);
        _head = 0;
      }
      return event;
    },
    peek() {
      if (_head >= _items.length) return null;
      return _items[_head];
    },
    clear() {
      _items = [];
      _head = 0;
    },
    size() {
      return _items.length - _head;
    },
    isEmpty() {
      return _head >= _items.length;
    },
    toArray() {
      return _items.slice(_head);
    },
    get rejectedCount() {
      return _rejectedCount;
    },
  });
}