import defaultExport, { commonTranslations } from './commonTranslations';

describe('commonTranslations dictionary', () => {
  test('default export is the same object as the named export', () => {
    expect(defaultExport).toBe(commonTranslations);
  });

  test('is a non-empty plain object of string -> string entries', () => {
    expect(typeof commonTranslations).toBe('object');
    const entries = Object.entries(commonTranslations);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach(([en, zh]) => {
      expect(typeof en).toBe('string');
      expect(en.trim()).not.toBe('');
      expect(typeof zh).toBe('string');
      expect(zh.trim()).not.toBe('');
    });
  });

  test('every value contains at least one Chinese character', () => {
    Object.values(commonTranslations).forEach((zh) => {
      expect(zh).toMatch(/[一-鿿]/);
    });
  });

  test('keys are English (no CJK characters)', () => {
    Object.keys(commonTranslations).forEach((en) => {
      expect(en).not.toMatch(/[一-鿿]/);
    });
  });

  test('contains expected well-known mappings', () => {
    expect(commonTranslations['Central Park']).toBe('中央公园');
    expect(commonTranslations['Marathon']).toBe('马拉松');
    expect(commonTranslations['NewBee Running Club']).toBe('新蜂跑步俱乐部');
    expect(commonTranslations['Upcoming']).toBe('即将举行');
    expect(commonTranslations['New Event']).toBe('新活动');
  });

  test('lookup miss returns undefined (callers must handle fallback)', () => {
    expect(commonTranslations['Nonexistent Phrase']).toBeUndefined();
    // Lookup is case-sensitive at the dictionary level
    expect(commonTranslations['central park']).toBeUndefined();
  });
});
