describe('client/index', () => {
  const originalLocation = global.location;

  afterEach(() => {
    global.location = originalLocation;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('selects the local world for local mode and github hosting', () => {
    const localWorld = class LocalWorld {};
    const networkWorld = class NetworkWorld {};

    jest.doMock('./world/local', () => ({ __esModule: true, default: localWorld }));
    jest.doMock('./world/client', () => ({ __esModule: true, default: networkWorld }));

    global.location = { search: '?local', hostname: 'localhost' } as any;
    jest.isolateModules(() => {
      const selected = require('./index').default;
      expect(selected).toBe(localWorld);
    });

    global.location = { search: '', hostname: 'demo.github.io' } as any;
    jest.isolateModules(() => {
      const selected = require('./index').default;
      expect(selected).toBe(localWorld);
    });
  });

  test('selects the network world for normal hosting', () => {
    const localWorld = class LocalWorld {};
    const networkWorld = class NetworkWorld {};

    jest.doMock('./world/local', () => ({ __esModule: true, default: localWorld }));
    jest.doMock('./world/client', () => ({ __esModule: true, default: networkWorld }));

    global.location = { search: '', hostname: 'play.example.com' } as any;
    jest.isolateModules(() => {
      const selected = require('./index').default;
      expect(selected).toBe(networkWorld);
    });
  });
});