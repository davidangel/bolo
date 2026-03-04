import * as net from './net';

describe('net protocol constants', () => {
  test('server message constants map to expected char codes', () => {
    expect(net.SYNC_MESSAGE).toBe('s'.charCodeAt(0));
    expect(net.WELCOME_MESSAGE).toBe('W'.charCodeAt(0));
    expect(net.CREATE_MESSAGE).toBe('C'.charCodeAt(0));
    expect(net.DESTROY_MESSAGE).toBe('D'.charCodeAt(0));
    expect(net.MAPCHANGE_MESSAGE).toBe('M'.charCodeAt(0));
    expect(net.UPDATE_MESSAGE).toBe('U'.charCodeAt(0));
    expect(net.TINY_UPDATE_MESSAGE).toBe('u'.charCodeAt(0));
    expect(net.SOUNDEFFECT_MESSAGE).toBe('S'.charCodeAt(0));
    expect(net.MINEOWNER_MESSAGE).toBe('m'.charCodeAt(0));
  });

  test('client message constants map to expected command chars', () => {
    expect(net.START_TURNING_CCW).toBe('L');
    expect(net.STOP_TURNING_CCW).toBe('l');
    expect(net.START_TURNING_CW).toBe('R');
    expect(net.STOP_TURNING_CW).toBe('r');
    expect(net.START_ACCELERATING).toBe('A');
    expect(net.STOP_ACCELERATING).toBe('a');
    expect(net.START_BRAKING).toBe('B');
    expect(net.STOP_BRAKING).toBe('b');
    expect(net.START_SHOOTING).toBe('S');
    expect(net.STOP_SHOOTING).toBe('s');
    expect(net.INC_RANGE).toBe('I');
    expect(net.DEC_RANGE).toBe('D');
    expect(net.BUILD_ORDER).toBe('O');
  });
});
