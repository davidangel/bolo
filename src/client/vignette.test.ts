import Vignette from './vignette';

describe('client/vignette', () => {
  const originalDocument = global.document;

  function makeElement(tagName: string) {
    return {
      tagName,
      className: '',
      textContent: '',
      children: [] as any[],
      parentNode: null as any,
      appendChild(child: any) {
        child.parentNode = this;
        this.children.push(child);
      },
      remove: jest.fn(function(this: any) {
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter((child: any) => child !== this);
        }
      })
    };
  }

  beforeEach(() => {
    const body = makeElement('body');
    global.document = {
      body,
      createElement: jest.fn((tag: string) => makeElement(tag))
    } as any;
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  test('renders, updates, and destroys the overlay', () => {
    const vignette = new Vignette();
    vignette.message('Loading');
    vignette.showProgress();
    vignette.hideProgress();
    vignette.progress({ loaded: 1, total: 2 });

    expect(vignette.container.className).toBe('vignette');
    expect(vignette.messageLine.className).toBe('vignette-message');
    expect(vignette.messageLine.textContent).toBe('Loading');

    vignette.destroy();
    expect((global.document.body as any).children).toHaveLength(0);
    expect((vignette as any).container).toBeNull();
    expect((vignette as any).messageLine).toBeNull();
  });
});