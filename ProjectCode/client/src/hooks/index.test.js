import { useAutoFillOnTab, useTranslationAutoFill } from './index';
import { useAutoFillOnTab as directAutoFill } from './useAutoFillOnTab';
import { useTranslationAutoFill as directTranslation } from './useTranslationAutoFill';

test('re-exports useAutoFillOnTab', () => {
  expect(typeof useAutoFillOnTab).toBe('function');
  expect(useAutoFillOnTab).toBe(directAutoFill);
});

test('re-exports useTranslationAutoFill', () => {
  expect(typeof useTranslationAutoFill).toBe('function');
  expect(useTranslationAutoFill).toBe(directTranslation);
});
