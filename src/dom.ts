// Lightweight DOM utility, analogous to jQuery for just what bolo needs.

type Selector = string | Element | null;

interface DomHelper {
  (selector: Selector): Element | null;
  create(tag: string, attrs?: Record<string, string>): Element;
  append(parent: Element, child: Element | Element[]): Element;
  on(el: Element, event: string, handler: EventListener): Element;
  off(el: Element, event: string, handler: EventListener): Element;
  cookie: {
    get(name: string): string | null;
    set(name: string, value: string, days?: number): void;
  };
}

const $ = (selector: Selector): Element | null => {
  if (typeof selector === 'string') {
    if (selector.startsWith('<')) {
      const temp = document.createElement('div');
      temp.innerHTML = selector;
      return temp.firstElementChild;
    }
    return document.querySelector(selector);
  }
  return selector;
};

($ as unknown as DomHelper).create = (tag: string, attrs: Record<string, string> = {}): Element => {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'class' || key === 'className') el.className = val;
    else if (key === 'text') el.textContent = val;
    else el.setAttribute(key, val);
  }
  return el;
};

($ as unknown as DomHelper).append = (parent: Element, child: Element | Element[]): Element => {
  if (Array.isArray(child)) {
    child.forEach(c => parent.appendChild(c));
  } else {
    parent.appendChild(child);
  }
  return parent;
};

($ as unknown as DomHelper).on = (el: Element, event: string, handler: EventListener): Element => {
  el.addEventListener(event, handler);
  return el;
};

($ as unknown as DomHelper).off = (el: Element, event: string, handler: EventListener): Element => {
  el.removeEventListener(event, handler);
  return el;
};

($ as unknown as DomHelper).cookie = {
  get: (name: string): string | null => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  },
  set: (name: string, value: string, days: number = 365): void => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/`;
  },
};

export default $ as unknown as DomHelper;
