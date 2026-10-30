"""
A simple word filter against objectionable content (App Store guideline 1.2, section 4 of the terms of use).
It can be fooled with spaces between the letters, the reports are the second line of defense.
"""

import re
import unicodedata

from app.core.errors import ObjectionableContentError

# Slurs, sexual content and harassment (English and German), rejected in messages and usernames
MESSAGE_WORDS = [
    # slurs
    "nigger*", "nigga*", "faggot*", "fag", "fags", "retard*", "tranny", "trannies", "chink*", "spic", "spics",
    "kike*", "wetback*", "coon", "coons", "neger*", "schwuchtel*", "kanake*", "spast*", "missgeburt*",
    # sexual content
    "porn*", "blowjob*", "handjob*", "cumshot*", "dildo*", "nudes", "send nudes", "whore*", "slut*", "hure*",
    "nutte", "nutten", "schlampe*", "fotze*", "rape*", "rapist*", "vergewaltig*",
    # harassment and hate
    "cunt*", "wichser*", "hurensohn*", "kys", "kill yourself", "kill urself", "kill your self", "bring dich um",
    "hitler*", "heil hitler", "sieg heil",
]

# Swearing and sexual words that are fine in a chat between friends, but not in a username everyone sees
USERNAME_WORDS = MESSAGE_WORDS + [
    "fuck*", "shit*", "bitch*", "asshole*", "arschloch*", "scheiss*", "wanker*", "motherf*", "penis*", "vagina*",
    "pussy*", "boobs", "tits", "dick", "dicks", "cock", "cocks", "ass", "anal", "cum", "sex", "fick", "ficken",
    "ficker",
]

# Too short or part of harmless words ("grape", "therapist", "peacock", "analysis", "spicy"), so in usernames they only
# match as a part of their own, separated by "_", "." , "-" or digits ("big_cock", not "hancock")
WHOLE_PART_ONLY = {
    "fag", "fags", "spic", "spics", "coon", "coons", "chink*", "kike*", "kys", "nudes", "hure*", "nutte", "nutten",
    "rape*", "rapist*", "dick", "dicks", "cock", "cocks", "ass", "anal", "cum", "sex", "tits", "fick", "retard*",
}

_LEET = str.maketrans("013457@$!", "oieastasi")


def _letters_pattern(word: str) -> str:
    """Every letter may be repeated, the words of a phrase are separated by anything that isn't a letter"""
    return r"[^a-z]+".join("".join(re.escape(letter) + "+" for letter in part) for part in word.split())


def _word_pattern(entry: str) -> re.Pattern:
    """The entry as a whole word, or with any ending for "word*" """
    word = entry.removesuffix("*")
    end = "" if entry.endswith("*") else "(?![a-z])"
    return re.compile(r"(?<![a-z])" + _letters_pattern(word) + end)


def _part_pattern(entry: str) -> re.Pattern:
    """The entry anywhere in a text without separators"""
    return re.compile("".join(re.escape(letter) + "+" for letter in entry.removesuffix("*").replace(" ", "")))


_MESSAGE_PATTERNS = [_word_pattern(entry) for entry in MESSAGE_WORDS]
_USERNAME_WORD_PATTERNS = [_word_pattern(entry) for entry in USERNAME_WORDS if entry in WHOLE_PART_ONLY]
_USERNAME_PART_PATTERNS = [_part_pattern(entry) for entry in USERNAME_WORDS if entry not in WHOLE_PART_ONLY]


def _variants(text: str) -> set[str]:
    """
    The lowercased text without accents, once with digits and symbols read as letters ("n1gg3r") and once with digits
    as separators ("dick69")
    """
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return {text.translate(_LEET), re.sub(r"[0-9]", " ", text)}


def contains_objectionable_words(text: str) -> bool:
    """Whether a chat message contains one of MESSAGE_WORDS"""
    return any(pattern.search(variant) for variant in _variants(text) for pattern in _MESSAGE_PATTERNS)


def is_objectionable_username(username: str) -> bool:
    """Whether a username contains one of USERNAME_WORDS, as a part of its own or anywhere for the longer ones"""
    for variant in _variants(username):
        if any(pattern.search(variant) for pattern in _USERNAME_WORD_PATTERNS):
            return True
        letters = re.sub(r"[^a-z]", "", variant)
        if any(pattern.search(letters) for pattern in _USERNAME_PART_PATTERNS):
            return True
    return False


def is_objectionable_group_name(name: str) -> bool:
    """
    Like a username, but word by word, so that the end and start of two words ("Glass Hole") don't match. Phrases
    ("Heil Hitler") are matched in the whole name.
    """
    return contains_objectionable_words(name) or any(is_objectionable_username(word) for word in name.split())


def check_message(content: str) -> None:
    if contains_objectionable_words(content):
        raise ObjectionableContentError(
            "Your message contains words that aren't allowed. See the Terms of Use at gym2.app/tos."
        )


def check_username(username: str) -> None:
    if is_objectionable_username(username):
        raise ObjectionableContentError("This username isn't allowed. Please choose another one.")


def check_group_name(name: str) -> None:
    if is_objectionable_group_name(name):
        raise ObjectionableContentError("This group name isn't allowed. Please choose another one.")
