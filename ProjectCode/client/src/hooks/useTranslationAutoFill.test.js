import { renderHook, act } from '@testing-library/react';
import useTranslationAutoFillDefault, {
  useTranslationAutoFill,
} from './useTranslationAutoFill';
import { translateText, detectLanguage } from '../utils/translate';

jest.mock('../utils/translate', () => ({
  translateText: jest.fn(),
  detectLanguage: jest.fn(),
}));

const blurEvent = (name, value) => ({ target: { name, value } });
const tabEvent = (name, value) => ({
  key: 'Tab',
  target: { name, value },
  preventDefault: jest.fn(),
});

const setup = (overrides = {}) => {
  const setValue = jest.fn();
  const getValue = jest.fn(() => '');
  const utils = renderHook(() =>
    useTranslationAutoFill({
      setValue,
      getValue,
      fieldPairs: [['name', 'chinese_name']],
      ...overrides,
    })
  );
  return { ...utils, setValue, getValue };
};

// Blur, flush the debounce, and let the translation promise settle.
const blurAndFlush = async (result, name, value, ms = 500) => {
  act(() => {
    result.current.handleBlur(blurEvent(name, value));
  });
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  detectLanguage.mockReturnValue('en');
  translateText.mockResolvedValue('翻译结果');
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('default export is the same hook as the named export', () => {
  expect(useTranslationAutoFillDefault).toBe(useTranslationAutoFill);
});

describe('handleBlur (debounced translation)', () => {
  test('translates the English field to Chinese after the default 500ms debounce', async () => {
    const { result } = setup();

    act(() => {
      result.current.handleBlur(blurEvent('name', 'Hello'));
    });
    expect(translateText).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(translateText).toHaveBeenCalledWith('Hello', 'en', 'zh');
    expect(result.current.translations).toEqual({ chinese_name: '翻译结果' });
  });

  test('translates the Chinese field to English', async () => {
    detectLanguage.mockReturnValue('zh');
    translateText.mockResolvedValue('Hello');
    const { result } = setup();

    await blurAndFlush(result, 'chinese_name', '你好');

    expect(translateText).toHaveBeenCalledWith('你好', 'zh', 'en');
    expect(result.current.translations).toEqual({ name: 'Hello' });
  });

  test('respects a custom debounceMs and resets the timer on rapid re-blur', async () => {
    const { result } = setup({ debounceMs: 200 });

    act(() => {
      result.current.handleBlur(blurEvent('name', 'Hel'));
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    act(() => {
      result.current.handleBlur(blurEvent('name', 'Hello'));
    });

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith('Hello', 'en', 'zh');
  });

  test('ignores fields that are not part of any pair', async () => {
    const { result } = setup();

    await blurAndFlush(result, 'unrelated', 'text');

    expect(translateText).not.toHaveBeenCalled();
  });

  test('clears the paired suggestion when the source is emptied', async () => {
    const { result } = setup();

    await blurAndFlush(result, 'name', 'Hello');
    expect(result.current.translations).toEqual({ chinese_name: '翻译结果' });

    await blurAndFlush(result, 'name', '   ');

    expect(result.current.translations).toEqual({});
    expect(translateText).toHaveBeenCalledTimes(1);
  });

  test('does not re-translate an unchanged value', async () => {
    const { result } = setup();

    await blurAndFlush(result, 'name', 'Hello');
    await blurAndFlush(result, 'name', 'Hello');

    expect(translateText).toHaveBeenCalledTimes(1);
  });

  test('skips translation when the detected language already matches the target', async () => {
    // User typed Chinese into the English field: detected zh === target zh
    detectLanguage.mockReturnValue('zh');
    const { result } = setup();

    await blurAndFlush(result, 'name', '你好');

    expect(translateText).not.toHaveBeenCalled();
    expect(result.current.translations).toEqual({});
  });

  test('does not store a suggestion when the translation equals the source', async () => {
    translateText.mockResolvedValue('Hello');
    const { result } = setup();

    await blurAndFlush(result, 'name', 'Hello');

    expect(result.current.translations).toEqual({});
  });

  test('warns and resets isTranslating when translation fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    translateText.mockRejectedValue(new Error('api down'));
    const { result } = setup();

    await blurAndFlush(result, 'name', 'Hello');

    expect(warnSpy).toHaveBeenCalledWith('Translation failed:', expect.any(Error));
    expect(result.current.isTranslating).toBe(false);
    expect(result.current.translations).toEqual({});
    warnSpy.mockRestore();
  });

  test('exposes isTranslating while a translation is in flight', async () => {
    let resolveTranslation;
    translateText.mockImplementation(
      () => new Promise((resolve) => { resolveTranslation = resolve; })
    );
    const { result } = setup();

    act(() => {
      result.current.handleBlur(blurEvent('name', 'Hello'));
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.isTranslating).toBe(true);

    await act(async () => {
      resolveTranslation('你好');
    });
    expect(result.current.isTranslating).toBe(false);
    expect(result.current.translations).toEqual({ chinese_name: '你好' });
  });
});

describe('handleKeyDown', () => {
  test('ignores non-Tab keys', () => {
    const { result, setValue } = setup();

    act(() => {
      result.current.handleKeyDown({
        key: 'Enter',
        target: { name: 'name', value: '' },
        preventDefault: jest.fn(),
      });
    });

    expect(setValue).not.toHaveBeenCalled();
    expect(translateText).not.toHaveBeenCalled();
  });

  test('auto-fills an empty field from its suggestion and consumes it', async () => {
    const { result, setValue } = setup();
    await blurAndFlush(result, 'name', 'Hello');

    const event = tabEvent('chinese_name', '');
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(setValue).toHaveBeenCalledWith('chinese_name', '翻译结果');
    expect(result.current.translations).toEqual({});
  });

  test('tabbing out of a filled source field triggers translation when the target is empty', async () => {
    const { result, getValue } = setup();
    getValue.mockReturnValue('');

    await act(async () => {
      result.current.handleKeyDown(tabEvent('name', 'Hello'));
    });

    expect(getValue).toHaveBeenCalledWith('chinese_name');
    expect(translateText).toHaveBeenCalledWith('Hello', 'en', 'zh');
    expect(result.current.translations).toEqual({ chinese_name: '翻译结果' });
  });

  test('does not translate when the target field already has content', () => {
    const { result, getValue } = setup();
    getValue.mockReturnValue('已有内容');

    act(() => {
      result.current.handleKeyDown(tabEvent('name', 'Hello'));
    });

    expect(translateText).not.toHaveBeenCalled();
  });

  test('does nothing for unmapped fields', () => {
    const { result, setValue } = setup();

    act(() => {
      result.current.handleKeyDown(tabEvent('unrelated', 'text'));
    });

    expect(setValue).not.toHaveBeenCalled();
    expect(translateText).not.toHaveBeenCalled();
  });
});

describe('handleFocus', () => {
  test('is a no-op with or without a pending suggestion', async () => {
    const { result, setValue } = setup();

    act(() => {
      result.current.handleFocus({ target: { name: 'chinese_name', value: '' } });
    });

    await blurAndFlush(result, 'name', 'Hello');
    act(() => {
      result.current.handleFocus({ target: { name: 'chinese_name', value: '' } });
    });

    expect(setValue).not.toHaveBeenCalled();
    expect(result.current.translations).toEqual({ chinese_name: '翻译结果' });
  });
});

describe('clearing suggestions', () => {
  test('clearTranslation removes a single suggestion', async () => {
    const { result } = setup();
    await blurAndFlush(result, 'name', 'Hello');

    act(() => {
      result.current.clearTranslation('chinese_name');
    });

    expect(result.current.translations).toEqual({});
  });

  test('clearAllTranslations empties suggestions and allows re-translation', async () => {
    const { result } = setup();
    await blurAndFlush(result, 'name', 'Hello');

    act(() => {
      result.current.clearAllTranslations();
    });
    expect(result.current.translations).toEqual({});

    // lastTranslated was reset, so the same value translates again
    await blurAndFlush(result, 'name', 'Hello');
    expect(translateText).toHaveBeenCalledTimes(2);
  });
});

describe('defaults and cleanup', () => {
  test('fieldPairs defaults to an empty array', async () => {
    const setValue = jest.fn();
    const getValue = jest.fn(() => '');
    const { result } = renderHook(() =>
      useTranslationAutoFill({ setValue, getValue })
    );

    act(() => {
      result.current.handleBlur(blurEvent('name', 'Hello'));
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(translateText).not.toHaveBeenCalled();
  });

  test('pending debounce timers are cleared on unmount', () => {
    const { result, unmount } = setup();

    act(() => {
      result.current.handleBlur(blurEvent('name', 'Hello'));
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(translateText).not.toHaveBeenCalled();
  });
});
