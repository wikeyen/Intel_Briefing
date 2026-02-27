# ABOUTME: Named entity recognition using spaCy with per-language models.
# ABOUTME: Extracts people, organizations, and places from EN and CN text.
from dataclasses import dataclass

import spacy
from spacy.language import Language

from nlp_sidecar.config import SPACY_MODELS
from nlp_sidecar.models import Entities


@dataclass
class NerModels:
    en: Language
    zh: Language


def load_ner_models() -> NerModels:
    return NerModels(
        en=spacy.load(SPACY_MODELS["en"]),
        zh=spacy.load(SPACY_MODELS["zh"]),
    )


PERSON_LABELS = {"PERSON", "PER"}
ORG_LABELS = {"ORG", "NORP"}
PLACE_LABELS = {"GPE", "LOC", "FAC"}


def extract_entities(text: str, lang: str, models: NerModels) -> Entities:
    if not text or len(text.strip()) < 2:
        return Entities()

    nlp = models.zh if lang == "zh" else models.en
    doc = nlp(text[:5000])

    people: list[str] = []
    orgs: list[str] = []
    places: list[str] = []
    seen: set[tuple[str, str]] = set()
    for ent in doc.ents:
        key = (ent.text, ent.label_)
        if key in seen:
            continue
        seen.add(key)
        if ent.label_ in PERSON_LABELS:
            people.append(ent.text)
        elif ent.label_ in ORG_LABELS:
            orgs.append(ent.text)
        elif ent.label_ in PLACE_LABELS:
            places.append(ent.text)

    return Entities(people=people, orgs=orgs, places=places)
