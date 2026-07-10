import { renderHook } from '@testing-library/react';
import useAutoFillOnTabDefault, { useAutoFillOnTab } from './useAutoFillOnTab';

const makeEvent = ({
  key = 'Tab',
  name = 'title',
  value = '',
  type = 'text',
  role,
  placeholder = '',
} = {}) => ({
  key,
  target: { name, value, type, role, placeholder },
  preventDefault: jest.fn(),
});

const setup = (options) => {
  const setValue = jest.fn();
  const { result } = renderHook(() =>
    useAutoFillOnTab({ setValue, ...options })
  );
  return { handler: result.current, setValue };
};

test('default export is the same hook as the named export', () => {
  expect(useAutoFillOnTabDefault).toBe(useAutoFillOnTab);
});

test('ignores non-Tab keys', () => {
  const { handler, setValue } = setup({ defaultValues: { title: 'Default' } });
  const event = makeEvent({ key: 'Enter' });

  handler(event);

  expect(setValue).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test('does nothing when the field already has a value', () => {
  const { handler, setValue } = setup({ defaultValues: { title: 'Default' } });
  const event = makeEvent({ value: 'Existing' });

  handler(event);

  expect(setValue).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test('fills an empty field with its default value on Tab', () => {
  const { handler, setValue } = setup({ defaultValues: { title: 'Default Title' } });
  const event = makeEvent({ value: '' });

  handler(event);

  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(setValue).toHaveBeenCalledWith('title', 'Default Title');
});

test('treats whitespace-only values as empty', () => {
  const { handler, setValue } = setup({ defaultValues: { title: 'Default Title' } });
  const event = makeEvent({ value: '   ' });

  handler(event);

  expect(setValue).toHaveBeenCalledWith('title', 'Default Title');
});

test('skips date inputs', () => {
  const { handler, setValue } = setup({ defaultValues: { title: 'Default' } });
  const event = makeEvent({ type: 'date' });

  handler(event);

  expect(setValue).not.toHaveBeenCalled();
});

test('skips combobox (select) inputs', () => {
  const { handler, setValue } = setup({ defaultValues: { title: 'Default' } });
  const event = makeEvent({ role: 'combobox' });

  handler(event);

  expect(setValue).not.toHaveBeenCalled();
});

test('falls back to the input placeholder when no default value is configured', () => {
  const { handler, setValue } = setup({ defaultValues: {} });
  const event = makeEvent({ placeholder: 'e.g. Morning Run' });

  handler(event);

  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(setValue).toHaveBeenCalledWith('title', 'e.g. Morning Run');
});

test('does nothing when neither default value nor placeholder exists', () => {
  const { handler, setValue } = setup({ defaultValues: {} });
  const event = makeEvent();

  handler(event);

  expect(setValue).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test('defaultValues option defaults to an empty object', () => {
  const setValue = jest.fn();
  const { result } = renderHook(() => useAutoFillOnTab({ setValue }));
  const event = makeEvent({ placeholder: 'From placeholder' });

  result.current(event);

  expect(setValue).toHaveBeenCalledWith('title', 'From placeholder');
});
