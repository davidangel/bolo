import Progress from './progress';

describe('client/progress', () => {
  test('tracks added work and chained completion callbacks', () => {
    const progress = new Progress(2);
    const onProgress = jest.fn();
    const onComplete = jest.fn();
    const chained = jest.fn();

    progress.on('progress', onProgress);
    progress.on('complete', onComplete);

    const done = progress.add(3, chained);
    expect(progress.total).toBe(5);

    done();
    expect(progress.loaded).toBe(3);
    expect(chained).toHaveBeenCalledTimes(1);

    progress.step(2);
    expect(onComplete).not.toHaveBeenCalled();

    progress.wrapUp();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalled();
  });

  test('supports default amounts and set()', () => {
    const progress = new Progress();
    const onComplete = jest.fn();
    progress.on('complete', onComplete);

    const done = progress.add();
    done();
    progress.step();
    progress.set(2, 2);
    progress.wrapUp();

    expect(progress.total).toBe(2);
    expect(progress.loaded).toBe(2);
    expect(progress.lengthComputable).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});