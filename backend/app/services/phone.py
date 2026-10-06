import phonenumbers

from app.errors import AppError

DEFAULT_REGION = "US"


def normalize_phone(raw: str) -> str:
    """Normalise any common phone format to E.164 (e.g. '(555) 010-0001' -> '+15550100001')."""
    try:
        parsed = phonenumbers.parse(raw, DEFAULT_REGION)
    except phonenumbers.NumberParseException:
        raise AppError(400, "invalid_phone", "Enter a valid phone number") from None
    # Demo numbers live in the fictional 555-01xx range, which libphonenumber marks
    # as "possible" but not "valid", so possibility is the bar here.
    if not phonenumbers.is_possible_number(parsed):
        raise AppError(400, "invalid_phone", "Enter a valid phone number")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
