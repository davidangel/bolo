import $ from './dom';

const asElement = (value: FakeElement): Element => value as unknown as Element;

class FakeElement {
  tagName: string;
  className = '';
  textContent: string | null = null;
  children: FakeElement[] = [];
  firstElementChild: FakeElement | null = null;
  attributes: Record<string, string> = {};
  listeners: Record<string, EventListener[]> = {};

  private _innerHTML = '';

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  setAttribute(key: string, value: string): void {
    this.attributes[key] = value;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, handler: EventListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: EventListener): void {
    this.listeners[event] = (this.listeners[event] || []).filter(h => h !== handler);
  }

  set innerHTML(value: string) {
    this._innerHTML = value;
    const match = value.match(/^\s*<([a-zA-Z0-9-]+)([^>]*)>/);
    if (!match) {
      this.firstElementChild = null;
      return;
    }
    const child = new FakeElement(match[1]);
    const attrs = match[2] || '';
    const idMatch = attrs.match(/id=["']([^"']+)["']/);
    if (idMatch) child.setAttribute('id', idMatch[1]);
    const classMatch = attrs.match(/class=["']([^"']+)["']/);
    if (classMatch) child.className = classMatch[1];
    this.firstElementChild = child;
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
}

describe('dom helper', () => {
  const originalDocument = (global as any).document;

  beforeEach(() => {
    const queryMap: Record<string, FakeElement> = {
      '#app': new FakeElement('div')
    };

    let cookieStore = '';

    (global as any).document = {
      createElement: (tag: string) => new FakeElement(tag),
      querySelector: (selector: string) => queryMap[selector] || null,
      get cookie() {
        return cookieStore;
      },
      set cookie(value: string) {
        cookieStore = value;
      }
    };
  });

  afterEach(() => {
    (global as any).document = originalDocument;
  });

  test('selects by CSS selector and returns elements directly', () => {
    const el = $('#app');
    expect(el).not.toBeNull();
    expect($(el)).toBe(el);
    expect($(null)).toBeNull();
  });

  test('creates element from HTML string selector', () => {
    const el = $('<span id="greeting" class="x">hello</span>') as unknown as FakeElement;
    expect(el.tagName).toBe('span');
    expect(el.attributes.id).toBe('greeting');
    expect(el.className).toBe('x');
  });

  test('create applies attrs and append handles single or array children', () => {
    const parent = $.create('div') as unknown as FakeElement;
    const child1 = $.create('span', { class: 'a', text: 'A', role: 'note' }) as unknown as FakeElement;
    const child2 = $.create('span', { className: 'b' }) as unknown as FakeElement;

    expect(child1.className).toBe('a');
    expect(child1.textContent).toBe('A');
    expect(child1.attributes.role).toBe('note');
    expect(child2.className).toBe('b');

    expect($.append(asElement(parent), asElement(child1))).toBe(asElement(parent));
    expect($.append(asElement(parent), [asElement(child2)])).toBe(asElement(parent));
    expect(parent.children).toEqual([child1, child2]);
  });

  test('on/off add and remove event listeners', () => {
    const el = $.create('button') as unknown as FakeElement;
    const handler = jest.fn() as unknown as EventListener;

    expect($.on(asElement(el), 'click', handler)).toBe(asElement(el));
    expect(el.listeners.click).toContain(handler);

    expect($.off(asElement(el), 'click', handler)).toBe(asElement(el));
    expect(el.listeners.click).toEqual([]);
  });

  test('cookie set/get roundtrip', () => {
    $.cookie.set('session', 'abc', 1);
    expect((global as any).document.cookie).toContain('session=abc');
    expect($.cookie.get('session')).toBe('abc');
    expect($.cookie.get('missing')).toBeNull();
  });
});
