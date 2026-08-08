#!/usr/bin/env python3
"""Keep only original LinkedIn posts from a Bright Data profile scrape.

Bright Data returns a profile's mixed ``activity`` feed.  It can contain posts
the person liked, commented on, shared, or reposted, so it must not be treated
as an authored-posts list without filtering.
"""

import argparse
import json
import re
from pathlib import Path
from typing import Any


# These phrases appear in Bright Data's ``interaction`` field for activity
# that is not an original post. Keep this deliberately focused on metadata,
# rather than matching post text, where a person might simply mention a share.
NON_ORIGINAL_INTERACTION = re.compile(
    r"\b(?:like[ds]?|comment(?:ed|s)?|share[ds]?|repost(?:ed|s)?|reshare[ds]?)\b",
    re.IGNORECASE,
)


def is_original_post(item: Any) -> bool:
    """Return True only for activity that is not a like, comment, or share."""
    if not isinstance(item, dict):
        return False

    # Prefer explicit flags if the dataset version supplies them.
    if item.get("is_reshare") or item.get("is_repost"):
        return False

    interaction = item.get("interaction")
    if isinstance(interaction, str) and NON_ORIGINAL_INTERACTION.search(interaction):
        return False

    # ``Posted by <profile>`` and a missing interaction both represent original
    # posts in the responses observed from this dataset. Unknown interaction
    # labels are excluded so a new activity type does not leak into the output.
    return interaction is None or (
        isinstance(interaction, str)
        and (
            interaction.strip() in {"", "-"}
            or interaction.casefold().lstrip().startswith("posted by ")
        )
    )


def parse_profiles(raw: str) -> list[dict[str, Any]]:
    """Parse a JSON array/object or a sequence of JSON objects from curl output."""
    decoder = json.JSONDecoder()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed_items: list[Any] = []
        offset = 0
        while offset < len(raw):
            while offset < len(raw) and raw[offset].isspace():
                offset += 1
            if offset == len(raw):
                break
            item, offset = decoder.raw_decode(raw, offset)
            parsed_items.append(item)
        parsed = parsed_items

    if isinstance(parsed, list):
        profiles = parsed
    elif isinstance(parsed, dict) and isinstance(parsed.get("profiles"), list):
        profiles = parsed["profiles"]
    elif isinstance(parsed, dict):
        profiles = [parsed]
    else:
        raise ValueError("Expected a profile object, a profiles array, or JSON objects.")

    if not all(isinstance(profile, dict) for profile in profiles):
        raise ValueError("Every profile must be a JSON object.")
    return profiles


def read_json_text(path: Path) -> str:
    """Read UTF-8 API output and Windows PowerShell's UTF-16 redirect output."""
    raw = path.read_bytes()
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16")
    text = raw.decode("utf-8-sig")
    # Some PowerShell workflows first decode UTF-16BE as text and then save it
    # as UTF-8. Rebuild the original bytes so JSON can be parsed normally.
    if text.startswith("\ufffe"):
        return text.encode("utf-16be").decode("utf-16")
    return text


def filter_profiles(profiles: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    filtered_profiles = []
    kept_count = 0
    removed_count = 0

    for profile in profiles:
        # Bright Data's current response calls this ``activity``. Older
        # profile-scraper exports call it ``posts``.
        field = "activity" if isinstance(profile.get("activity"), list) else "posts"
        items = profile.get(field)
        if not isinstance(items, list):
            filtered_profiles.append(profile)
            continue

        original_posts = []
        for item in items:
            if is_original_post(item):
                original_posts.append(item)
                kept_count += 1
            else:
                removed_count += 1

        filtered_profile = dict(profile)
        # Preserve the original response shape while making its contents safe to
        # consume as authored posts.
        filtered_profile[field] = original_posts
        filtered_profiles.append(filtered_profile)

    return filtered_profiles, {
        "profiles": len(filtered_profiles),
        "kept_posts": kept_count,
        "removed_activity": removed_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, default=Path("linkedin_output.json"))
    parser.add_argument("output", nargs="?", type=Path, default=Path("linkedin_posts_only.json"))
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    try:
        profiles = parse_profiles(read_json_text(args.input))
        filtered, stats = filter_profiles(profiles)
    except (json.JSONDecodeError, ValueError) as error:
        raise SystemExit(f"Could not parse {args.input}: {error}") from error

    args.output.write_text(json.dumps(filtered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.output} — profiles: {stats['profiles']} "
        f"kept_posts: {stats['kept_posts']} removed_activity: {stats['removed_activity']}"
    )


if __name__ == "__main__":
    main()
