"""Time utility functions."""


def time_to_seconds(time_str: str) -> float:
    """Convert time string (H:MM:SS or MM:SS) to seconds for comparison."""
    try:
        parts = time_str.strip().split(':')
        parts = [float(p) for p in parts]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        elif len(parts) == 2:
            return parts[0] * 60 + parts[1]
        return float(time_str)
    except (ValueError, AttributeError):
        return float('inf')
