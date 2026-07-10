"""
Name Detector Utility
Detects common base names from event titles for auto-grouping.

Examples:
- "Brooklyn Half 2024" + "Brooklyn Half 2023" -> "Brooklyn Half Marathon"
- "NYC Marathon 2024" + "NYC Marathon 2023" -> "NYC Marathon"
- "1st Annual Turkey Trot" + "2nd Annual Turkey Trot" -> "Turkey Trot"
"""

import re
from typing import List, Optional, Tuple


# Common race distance standardizations
DISTANCE_EXPANSIONS = {
    'half': 'Half Marathon',
    '5k': '5K',
    '10k': '10K',
    'marathon': 'Marathon',
    'mile': 'Mile',
}

# Patterns to remove from event names
YEAR_PATTERN = re.compile(r'\b(19|20)\d{2}\b')
ORDINAL_PATTERN = re.compile(r'\b\d{1,2}(st|nd|rd|th)\b', re.IGNORECASE)
ANNUAL_PATTERN = re.compile(r'\bannual\b', re.IGNORECASE)
EDITION_PATTERN = re.compile(r'\b(edition|ed\.?)\b', re.IGNORECASE)

# Chinese patterns
# NOTE: \b does not work here — CJK characters count as \w, so there is no
# word boundary between "2024年" and "布鲁克林". Use digit lookarounds instead.
CN_YEAR_PATTERN = re.compile(r'(?<!\d)(19|20)\d{2}(?!\d)年?')
CN_ORDINAL_PATTERN = re.compile(r'第\d+届')


def normalize_name(name: str) -> str:
    """Remove years, ordinals, and normalize spacing."""
    if not name:
        return ''

    # Remove years (2023, 2024, etc.)
    name = YEAR_PATTERN.sub('', name)

    # Remove ordinals (1st, 2nd, 23rd, etc.)
    name = ORDINAL_PATTERN.sub('', name)

    # Remove "Annual"
    name = ANNUAL_PATTERN.sub('', name)

    # Remove "Edition"
    name = EDITION_PATTERN.sub('', name)

    # Normalize whitespace
    name = ' '.join(name.split())

    return name.strip()


def normalize_name_cn(name: str) -> str:
    """Remove years and ordinals from Chinese names."""
    if not name:
        return ''

    # Remove years (2023, 2024年, etc.)
    name = CN_YEAR_PATTERN.sub('', name)

    # Remove ordinals (第1届, 第23届, etc.)
    name = CN_ORDINAL_PATTERN.sub('', name)

    # Normalize whitespace
    name = ' '.join(name.split())

    return name.strip()


def find_common_tokens(names: List[str]) -> List[str]:
    """Find tokens that appear in all names."""
    if not names:
        return []

    # Tokenize each name
    token_sets = []
    for name in names:
        normalized = normalize_name(name)
        tokens = normalized.lower().split()
        token_sets.append(set(tokens))

    # Find intersection of all token sets
    if not token_sets:
        return []

    common = token_sets[0]
    for token_set in token_sets[1:]:
        common = common.intersection(token_set)

    return list(common)


def expand_distance(name: str) -> str:
    """Expand short distance names to full form."""
    words = name.split()
    expanded = []

    for word in words:
        word_lower = word.lower()
        if word_lower in DISTANCE_EXPANSIONS:
            expanded.append(DISTANCE_EXPANSIONS[word_lower])
        else:
            expanded.append(word)

    return ' '.join(expanded)


def detect_common_name(name_a: str, name_b: str) -> str:
    """
    Detect the common base name from two event names.

    Args:
        name_a: First event name
        name_b: Second event name

    Returns:
        Common base name with proper capitalization

    Example:
        detect_common_name("Brooklyn Half 2024", "Brooklyn Half 2023")
        -> "Brooklyn Half Marathon"
    """
    if not name_a or not name_b:
        return normalize_name(name_a or name_b)

    # Normalize both names
    norm_a = normalize_name(name_a)
    norm_b = normalize_name(name_b)

    # If one is substring of the other (case-insensitive), use the shorter one
    if norm_a.lower() in norm_b.lower():
        base_name = norm_a
    elif norm_b.lower() in norm_a.lower():
        base_name = norm_b
    else:
        # Find common prefix word by word
        words_a = norm_a.split()
        words_b = norm_b.split()

        common_words = []
        for i in range(min(len(words_a), len(words_b))):
            if words_a[i].lower() == words_b[i].lower():
                # Preserve capitalization from first name
                common_words.append(words_a[i])
            else:
                break

        if common_words:
            base_name = ' '.join(common_words)
        else:
            # Fall back to finding common tokens
            common_tokens = find_common_tokens([name_a, name_b])
            if common_tokens:
                # Reconstruct in order they appear in first name
                words = norm_a.split()
                ordered = [w for w in words if w.lower() in common_tokens]
                base_name = ' '.join(ordered) if ordered else norm_a
            else:
                base_name = norm_a

    # Expand distance names
    base_name = expand_distance(base_name)

    return base_name


def detect_common_name_cn(name_a: str, name_b: str) -> str:
    """
    Detect the common base name from two Chinese event names.

    Args:
        name_a: First event name (Chinese)
        name_b: Second event name (Chinese)

    Returns:
        Common base name in Chinese
    """
    if not name_a or not name_b:
        return normalize_name_cn(name_a or name_b)

    # Normalize both names
    norm_a = normalize_name_cn(name_a)
    norm_b = normalize_name_cn(name_b)

    # If one is substring of the other, use the shorter one
    if norm_a in norm_b:
        return norm_a
    elif norm_b in norm_a:
        return norm_b

    # Find longest common substring for Chinese
    # (Chinese doesn't have word boundaries like English)
    def longest_common_substring(s1: str, s2: str) -> str:
        m, n = len(s1), len(s2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        max_len = 0
        end_pos = 0

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if s1[i-1] == s2[j-1]:
                    dp[i][j] = dp[i-1][j-1] + 1
                    if dp[i][j] > max_len:
                        max_len = dp[i][j]
                        end_pos = i

        return s1[end_pos - max_len:end_pos]

    common = longest_common_substring(norm_a, norm_b)

    # Return common substring if it's meaningful (at least 2 characters)
    if len(common) >= 2:
        return common

    return norm_a


def detect_group_name_from_events(events: List[dict]) -> Tuple[str, str]:
    """
    Detect common name from a list of events.

    Args:
        events: List of event dicts with 'name' and optional 'chinese_name' keys

    Returns:
        Tuple of (english_name, chinese_name)
    """
    if not events:
        return ('', '')

    if len(events) == 1:
        event = events[0]
        return (
            normalize_name(event.get('name', '')),
            normalize_name_cn(event.get('chinese_name', ''))
        )

    # Start with first two events
    en_name = detect_common_name(
        events[0].get('name', ''),
        events[1].get('name', '')
    )
    cn_name = detect_common_name_cn(
        events[0].get('chinese_name', ''),
        events[1].get('chinese_name', '')
    )

    # Refine with remaining events
    for event in events[2:]:
        en_name = detect_common_name(en_name, event.get('name', ''))
        cn_name = detect_common_name_cn(cn_name, event.get('chinese_name', ''))

    return (en_name, cn_name)
