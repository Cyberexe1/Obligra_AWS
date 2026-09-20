"""Conservative deadline text parsing.

Obligation deadlines are free-text strings produced by the Bedrock
extraction pipeline (e.g. "by March 31", "within 5 days of application
approval", "every Monday"). This module converts the subset of those
strings that state a genuine absolute date into a real `date`, and
deliberately returns `None` for everything else rather than guessing.

This matters for the risk analysis layer: risk calculations must be
rule-based and explainable, and must never invent information. A naive
fuzzy date parser will happily turn "within 5 days of application
approval" or "every Monday" into a specific calendar date that has no
basis in the source text — this module exists specifically to avoid that.

Rules, in order:
  1. Strip surrounding quote characters, if the whole string is wrapped
     in matching quotes (the extraction model sometimes returns deadline
     values as e.g. `"by December 31 2027"`, quote marks included).
  2. Strip a small set of known lead-in phrases ("by", "before", "due", ...).
  3. Reject the remaining text outright if it contains a relative or
     recurring time marker ("within", "every", "each", "after", "annually",
     etc) — these do not state an absolute date, no matter how the rest
     of the sentence reads.
  4. Attempt a strict (non-fuzzy) date parse of what remains. Strict
     parsing refuses input with unrecognized surrounding text, so it
     will not silently misinterpret a non-date phrase as a date.
  5. If the parsed date has no explicit year in the source text and the
     resulting date has already passed, roll forward to the next
     occurrence of that month/day — the standard, unambiguous convention
     for year-omitted dates, not a guess at intent.
"""

import re
from datetime import date, datetime

from dateutil import parser as dateutil_parser
from dateutil.parser import ParserError

_LEAD_IN_PATTERN = re.compile(
    r"^(by|before|on or before|no later than|due(?: by| on)?|deadline:?|due:?)\s+",
    re.IGNORECASE,
)

# Matches a string that is entirely wrapped in one layer of matching quote
# characters (straight or curly), e.g. '"by December 31 2027"' or the
# Unicode equivalents — the extraction model sometimes emits deadline text
# this way.
_WRAPPING_QUOTES_PATTERN = re.compile(r'^(["\'\u201c\u2018])(.*)([\"\'\u201d\u2019])$', re.DOTALL)


def _strip_wrapping_quotes(text: str) -> str:
    match = _WRAPPING_QUOTES_PATTERN.match(text)
    if match:
        return match.group(2).strip()
    return text

# Any of these markers indicate the text describes a relative, conditional,
# or recurring time constraint rather than a single absolute date.
_REJECT_MARKERS = re.compile(
    r"\b("
    r"every|each|annually|monthly|weekly|daily|recurring|"
    r"within|after|following|from(?:\s+the)?|"
    r"days?\s+(of|after|before|from)|"
    r"weeks?\s+(of|after|before|from)|"
    r"months?\s+(of|after|before|from)|"
    r"business\s+days?"
    r")\b",
    re.IGNORECASE,
)

# Sentinel years used to detect whether the source text included an
# explicit year: if parsing with two different default years produces two
# different result years, the text itself had no year and the parser
# fell back to whichever default was supplied.
_DEFAULT_YEAR_A = datetime(1, 1, 1)
_DEFAULT_YEAR_B = datetime(2, 1, 1)


def parse_deadline(deadline_text: str | None, today: date | None = None) -> date | None:
    """Attempt to resolve a free-text deadline into an absolute date.

    Returns `None` if the text does not state a genuine absolute date
    (including all relative, conditional, and recurring phrasing) or if
    it cannot be parsed at all. Never guesses a date that isn't actually
    supported by the text.
    """
    if not deadline_text or not deadline_text.strip():
        return None

    unquoted = _strip_wrapping_quotes(deadline_text.strip())

    if _REJECT_MARKERS.search(unquoted):
        return None

    stripped = _LEAD_IN_PATTERN.sub("", unquoted)
    if not stripped:
        return None

    try:
        parsed_a = dateutil_parser.parse(stripped, fuzzy=False, default=_DEFAULT_YEAR_A)
        parsed_b = dateutil_parser.parse(stripped, fuzzy=False, default=_DEFAULT_YEAR_B)
    except (ParserError, ValueError, OverflowError):
        return None

    year_was_explicit = parsed_a.year == parsed_b.year
    result = parsed_a.date()

    if not year_was_explicit:
        reference_today = today or date.today()
        # The parser filled in a placeholder year; re-anchor to the
        # current year, then roll forward one year if that date has
        # already passed — the standard convention for year-omitted dates.
        try:
            result = result.replace(year=reference_today.year)
        except ValueError:
            # Feb 29 in a non-leap current year; nudge to Mar 1 rather
            # than crash, still a deterministic and explainable rule.
            result = result.replace(month=3, day=1, year=reference_today.year)

        if result < reference_today:
            try:
                result = result.replace(year=result.year + 1)
            except ValueError:
                result = result.replace(month=3, day=1, year=result.year + 1)

    return result


def days_remaining(deadline_text: str | None, today: date | None = None) -> int | None:
    """Return the number of days until the parsed deadline, or `None` if unresolvable.

    A negative value means the deadline has already passed.
    """
    parsed = parse_deadline(deadline_text, today=today)
    if parsed is None:
        return None
    reference_today = today or date.today()
    return (parsed - reference_today).days
