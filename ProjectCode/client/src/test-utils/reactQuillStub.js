/**
 * Jest stub for react-quill (see package.json moduleNameMapper): renders a
 * plain textarea so tests can type content without a real Quill editor.
 */
const React = require('react');

module.exports = function ReactQuill({ value, onChange, placeholder }) {
  return React.createElement('textarea', {
    'data-testid': 'quill-editor',
    value: value || '',
    placeholder,
    onChange: (e) => onChange && onChange(e.target.value),
  });
};
