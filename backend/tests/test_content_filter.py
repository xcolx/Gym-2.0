import pytest

from app.core import content_filter
from app.core.errors import ObjectionableContentError


@pytest.mark.parametrize("message", [
    "you are a whore",
    "send nudes",
    "SEND   NUDES!!",
    "kys",
    "Kill Yourself",
    "n1gg3r",
    "whoooore",
    "sieg heil",
    "porno",
    "du Hurensohn",
])
def test_messages_with_objectionable_words_are_rejected(message):
    assert content_filter.contains_objectionable_words(message)
    with pytest.raises(ObjectionableContentError):
        content_filter.check_message(message)


@pytest.mark.parametrize("message", [
    "Leg day was great",
    "fuck this is heavy",          # ordinary swearing is fine between friends
    "that set was shit",
    "my therapist says rest more",
    "grapes after the workout",
    "spicy food",
    "peacock",
    "Scunthorpe",
    "",
])
def test_ordinary_messages_are_allowed(message):
    assert not content_filter.contains_objectionable_words(message)
    content_filter.check_message(message)


@pytest.mark.parametrize("username", [
    "fuckface",
    "xX_n1gger_Xx",
    "fuuuuck",
    "big_cock",
    "dick69",
    "ass.man",
    "shithead",
    "Hitler88",
])
def test_objectionable_usernames_are_rejected(username):
    assert content_filter.is_objectionable_username(username)
    with pytest.raises(ObjectionableContentError):
        content_filter.check_username(username)


@pytest.mark.parametrize("username", [
    "hancock",
    "therapist",
    "analysis",
    "grape_lover",
    "passion.fruit",
    "class_act",
    "marggus",
    "fit_guy123",
])
def test_harmless_usernames_are_allowed(username):
    assert not content_filter.is_objectionable_username(username)
    content_filter.check_username(username)


@pytest.mark.parametrize("name, objectionable", [
    ("Glass Hole", False),          # the end and start of two words don't match
    ("Heil Hitler", True),          # phrases are matched across words
    ("Shit Lifters", True),
    ("Morning Crew", False),
    ("Bench Bros", False),
])
def test_group_names(name, objectionable):
    assert content_filter.is_objectionable_group_name(name) is objectionable
    if objectionable:
        with pytest.raises(ObjectionableContentError):
            content_filter.check_group_name(name)
    else:
        content_filter.check_group_name(name)
