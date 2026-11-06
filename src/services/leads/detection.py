"""Cheap regex check for contact details in a visitor's chat message.

Runs inline on every widget message, so it must stay fast and must not fire on
ordinary numbers (prices such as "NPR 7,500", years, dates, quantities). Only
when it finds something does the (slow, rate-limited) LLM extraction run.

Phone formats recognised (separators: space, dot, hyphen):
  * Nepali mobiles: 97/98 + 8 digits, optionally prefixed by +977 / 977 / 00977
    e.g. 9841234567, 984-123-4567, +977 9841234567, 977-98-41234567
  * Landlines: 0 + area code + subscriber number, 9 digits in total
    e.g. 01-4123456 (Kathmandu), 061-523456 (Pokhara), (01) 4123456
    or the same with +977 and without the leading 0, e.g. +977-1-4123456
"""

import re
from dataclasses import dataclass, field
from typing import List

_SEP = r"[\s.\-]?"

# Mobile: optional country code, then 9[78] and 8 more digits with optional single separators.
_MOBILE_RE = re.compile(
    rf"(?<![\d+])(?:(?:\+|00)?977{_SEP}[\s\-]*)?(9[78](?:{_SEP}\d){{8}})(?!\d)",
    re.ASCII,
)
# Landline with country code: +977 [0] area+subscriber = 8 digits after the country code.
_LANDLINE_INTL_RE = re.compile(
    rf"(?<![\d+])(?:\+|00)?977{_SEP}[\s\-]*\(?0?([1-8](?:\)?{_SEP}\d){{7}})(?!\d)",
    re.ASCII,
)
# Domestic landline: 0 + 1-2 digit area code (optionally in brackets) + subscriber, 9 digits total.
_LANDLINE_RE = re.compile(
    rf"(?<![\d+\w])(\(?0[1-8]\d?\)?{_SEP}\d(?:{_SEP}\d){{5,6}})(?!\d)",
    re.ASCII,
)
_EMAIL_RE = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")

_DEVANAGARI_RE = re.compile("[\u0900-\u097F]")
# Visitors may type numbers in Devanagari digits (९८४१२३४५६७); same length, so match spans are unchanged.
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _digits(text: str) -> str:
    return re.sub(r"[^0-9]", "", text)


@dataclass
class ContactMatches:
    phones: List[str] = field(default_factory=list)
    emails: List[str] = field(default_factory=list)

    @property
    def found(self) -> bool:
        return bool(self.phones or self.emails)


def _add(items: List[str], value: str) -> None:
    if value not in items:
        items.append(value)


def find_phones(text: str) -> List[str]:
    """Normalised Nepali phone numbers in `text`: mobiles as +977XXXXXXXXXX, landlines as 0XXXXXXXX."""
    if not text:
        return []
    text = text.translate(_DEVANAGARI_DIGITS)
    found: List[str] = []
    taken: List[range] = []

    def overlaps(span) -> bool:
        return any(span[0] < r.stop and r.start < span[1] for r in taken)

    for m in _MOBILE_RE.finditer(text):
        taken.append(range(*m.span()))
        _add(found, "+977" + _digits(m.group(1)))

    for m in _LANDLINE_INTL_RE.finditer(text):
        if overlaps(m.span()):
            continue
        digits = _digits(m.group(1))
        if digits.startswith(("97", "98")):
            continue  # a mobile with a digit missing, not a landline
        taken.append(range(*m.span()))
        _add(found, "0" + digits)

    for m in _LANDLINE_RE.finditer(text):
        if overlaps(m.span()):
            continue
        digits = _digits(m.group(1))
        if len(digits) != 9:
            continue
        taken.append(range(*m.span()))
        _add(found, digits)

    return found


def find_emails(text: str) -> List[str]:
    if not text:
        return []
    found: List[str] = []
    for m in _EMAIL_RE.finditer(text):
        _add(found, m.group(0).rstrip(".").lower())
    return found


def find_contacts(text: str) -> ContactMatches:
    return ContactMatches(phones=find_phones(text), emails=find_emails(text))


def has_contact_info(text: str) -> bool:
    """The cheap gate: does this visitor message contain a phone number or email address?"""
    return find_contacts(text).found


def guess_language(texts: List[str]) -> str:
    """Fallback language label when the LLM is unavailable."""
    return "Nepali" if any(_DEVANAGARI_RE.search(t or "") for t in texts) else "English"
