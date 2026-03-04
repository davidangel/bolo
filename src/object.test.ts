import BoloObject from './object';

describe('BoloObject', () => {
  test('initial defaults are correct', () => {
    const obj = new BoloObject({ soundEffect: jest.fn() });
    expect(obj.styled).toBeNull();
    expect(obj.team).toBeNull();
    expect(obj.x).toBeNull();
    expect(obj.y).toBeNull();
    expect(obj.getTile()).toBeUndefined();
  });

  test('soundEffect forwards coordinates and source to world', () => {
    const world = { soundEffect: jest.fn() };
    const obj = new BoloObject(world as any);
    obj.x = 123;
    obj.y = 456;

    obj.soundEffect(9);

    expect(world.soundEffect).toHaveBeenCalledWith(9, 123, 456, obj);
  });
});
