import translateDefault, {
  detectLanguage,
  translateText,
  autoTranslate,
} from './translate';

// The module keeps a module-level cache Map, so tests use distinct phrases
// unless they are explicitly exercising the cache.

const okResponse = (translatedText, responseStatus = 200) => ({
  ok: true,
  json: async () => ({
    responseStatus,
    responseData: { translatedText },
  }),
});

let warnSpy;

beforeEach(() => {
  global.fetch = jest.fn();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  delete global.fetch;
});

test('default export is translateText', () => {
  expect(translateDefault).toBe(translateText);
});

describe('detectLanguage', () => {
  test('returns en for empty/undefined input', () => {
    expect(detectLanguage('')).toBe('en');
    expect(detectLanguage(null)).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });

  test('returns en for whitespace-only input (no countable characters)', () => {
    expect(detectLanguage('   ')).toBe('en');
  });

  test('detects pure Chinese text', () => {
    expect(detectLanguage('你好世界')).toBe('zh');
  });

  test('detects pure English text', () => {
    expect(detectLanguage('Hello world')).toBe('en');
  });

  test('detects mixed text as Chinese when >30% CJK', () => {
    // 5 non-space chars, 2 Chinese => 40%
    expect(detectLanguage('跑步 run')).toBe('zh');
  });

  test('detects mixed text as English when <=30% CJK', () => {
    // 10 non-space chars, 2 Chinese => 20%
    expect(detectLanguage('跑步 marathon')).toBe('en');
  });
});

describe('translateText', () => {
  test('returns empty string for empty or whitespace-only input without fetching', async () => {
    await expect(translateText('', 'en', 'zh')).resolves.toBe('');
    await expect(translateText('   ', 'en', 'zh')).resolves.toBe('');
    await expect(translateText(null, 'en', 'zh')).resolves.toBe('');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('short-circuits via common translations EN -> ZH (case-insensitive, trimmed)', async () => {
    await expect(translateText('Central Park', 'en', 'zh')).resolves.toBe('中央公园');
    await expect(translateText('  central park  ', 'en', 'zh')).resolves.toBe('中央公园');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('short-circuits via common translations ZH -> EN', async () => {
    await expect(translateText('中央公园', 'zh', 'en')).resolves.toBe('Central Park');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('calls MyMemory API with mapped language pair and returns translation', async () => {
    global.fetch.mockResolvedValue(okResponse('独特短语一'));

    const result = await translateText('unique phrase one', 'en', 'zh');
    expect(result).toBe('独特短语一');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('https://api.mymemory.translated.net/get?');
    expect(url).toContain('q=unique+phrase+one');
    expect(url).toContain(`langpair=${encodeURIComponent('en|zh-CN')}`);
    expect(options).toEqual({ method: 'GET', headers: { Accept: 'application/json' } });
  });

  test('maps zh to zh-CN for the source language too', async () => {
    global.fetch.mockResolvedValue(okResponse('some phrase'));
    await translateText('某个短语', 'zh', 'en');
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain(`langpair=${encodeURIComponent('zh-CN|en')}`);
  });

  test('caches successful translations and skips fetch on repeat calls', async () => {
    global.fetch.mockResolvedValue(okResponse('缓存结果'));

    await expect(translateText('cache me please', 'en', 'zh')).resolves.toBe('缓存结果');
    await expect(translateText('cache me please', 'en', 'zh')).resolves.toBe('缓存结果');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('does not cache when the API echoes the input back (failed translation)', async () => {
    global.fetch.mockResolvedValue(okResponse('Echoed Phrase Two'));

    await expect(translateText('echoed phrase two', 'en', 'zh')).resolves.toBe('Echoed Phrase Two');
    // Not cached (case-insensitive match with input), so a second call fetches again
    await translateText('echoed phrase two', 'en', 'zh');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('returns trimmed input when the API responds non-OK', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(translateText('  non ok phrase  ', 'en', 'zh')).resolves.toBe('non ok phrase');
    expect(warnSpy).toHaveBeenCalledWith(
      'Translation API returned non-OK status:',
      500
    );
  });

  test('returns trimmed input when responseStatus is not 200', async () => {
    global.fetch.mockResolvedValue(okResponse('ignored', 403));
    await expect(translateText('quota phrase', 'en', 'zh')).resolves.toBe('quota phrase');
  });

  test('returns trimmed input when responseData is missing', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ responseStatus: 200 }),
    });
    await expect(translateText('missing data phrase', 'en', 'zh')).resolves.toBe(
      'missing data phrase'
    );
  });

  test('returns trimmed input on network error', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    await expect(translateText('  offline phrase  ', 'en', 'zh')).resolves.toBe('offline phrase');
    expect(warnSpy).toHaveBeenCalledWith('Translation API error:', 'network down');
  });
});

describe('autoTranslate', () => {
  test('detects Chinese input and translates to English', async () => {
    const result = await autoTranslate('中央公园');
    expect(result).toEqual({
      translation: 'Central Park',
      detectedLang: 'zh',
      targetLang: 'en',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('detects English input and translates to Chinese', async () => {
    const result = await autoTranslate('Marathon');
    expect(result).toEqual({
      translation: '马拉松',
      detectedLang: 'en',
      targetLang: 'zh',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
