import {
  committeeTerms,
  committeeMembers,
  committee2026,
  committee2024,
} from './committeeMembers';

describe('committeeTerms shape invariants', () => {
  test('is a non-empty array of well-formed term objects', () => {
    expect(Array.isArray(committeeTerms)).toBe(true);
    expect(committeeTerms.length).toBeGreaterThan(0);

    committeeTerms.forEach((term) => {
      expect(typeof term.id).toBe('string');
      expect(term.id).not.toBe('');
      expect(typeof term.label).toBe('string');
      expect(term.label).not.toBe('');
      expect(typeof term.label_cn).toBe('string');
      expect(term.label_cn).not.toBe('');
      expect(typeof term.current).toBe('boolean');
      expect(Array.isArray(term.members)).toBe(true);
    });
  });

  test('term ids are unique', () => {
    const ids = committeeTerms.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('exactly one term is marked current', () => {
    const currentTerms = committeeTerms.filter((t) => t.current);
    expect(currentTerms).toHaveLength(1);
  });

  test('every term has a non-empty members list', () => {
    committeeTerms.forEach((term) => {
      expect(term.members.length).toBeGreaterThan(0);
    });
  });

  test('every member has id, name, bilingual position, and image', () => {
    committeeTerms.forEach((term) => {
      term.members.forEach((member) => {
        expect(typeof member.id).toBe('number');
        expect(typeof member.name).toBe('string');
        expect(member.name.trim()).not.toBe('');
        expect(typeof member.position).toBe('object');
        expect(typeof member.position.en).toBe('string');
        expect(member.position.en).not.toBe('');
        expect(typeof member.position.zh).toBe('string');
        expect(member.position.zh).not.toBe('');
        expect(typeof member.image).toBe('string');
        expect(member.image).toMatch(/^\//);
      });
    });
  });

  test('member ids are unique within each term', () => {
    committeeTerms.forEach((term) => {
      const ids = term.members.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

describe('backward-compatible exports', () => {
  test('committeeMembers is the current term\'s members array (same reference)', () => {
    const currentTerm = committeeTerms.find((t) => t.current);
    expect(committeeMembers).toBe(currentTerm.members);
  });

  test('committee2026 matches the 2026-2028 term members', () => {
    const term = committeeTerms.find((t) => t.id === '2026-2028');
    expect(term).toBeDefined();
    expect(committee2026).toBe(term.members);
  });

  test('committee2024 matches the 2024-2026 term members', () => {
    const term = committeeTerms.find((t) => t.id === '2024-2026');
    expect(term).toBeDefined();
    expect(committee2024).toBe(term.members);
  });

  test('current term (used for admin checks) is the 2026-2028 term', () => {
    const currentTerm = committeeTerms.find((t) => t.current);
    expect(currentTerm.id).toBe('2026-2028');
  });
});
