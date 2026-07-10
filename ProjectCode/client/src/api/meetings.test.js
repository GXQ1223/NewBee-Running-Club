import { getMeetingFiles, getMeetingContent } from './meetings';

test('getMeetingFiles returns an empty array (deprecated)', () => {
  expect(getMeetingFiles()).toEqual([]);
});

test('getMeetingContent warns about deprecation and resolves to empty string', async () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(getMeetingContent()).resolves.toBe('');
  expect(warnSpy).toHaveBeenCalledWith(
    'getMeetingContent is deprecated. Use getMeetingMinutesById instead.'
  );
  warnSpy.mockRestore();
});
