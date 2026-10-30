"""
Checks uploaded images for nudity with NudeNet's 640m detector (App Store guideline 1.2). Exercise images aren't
checked: only their creator sees them, and verified exercises get new images before anyone else does.
Without NUDITY_FILTER_MODEL_PATH the check is off, which only development allows.
"""

import logging
import threading
from dataclasses import dataclass, field

import numpy as np
import onnxruntime
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

# The classes of the model, in the order of its output (nudenet.py of NudeNet 3.4)
LABELS = (
    "FEMALE_GENITALIA_COVERED", "FACE_FEMALE", "BUTTOCKS_EXPOSED", "FEMALE_BREAST_EXPOSED", "FEMALE_GENITALIA_EXPOSED",
    "MALE_BREAST_EXPOSED", "ANUS_EXPOSED", "FEET_EXPOSED", "BELLY_COVERED", "FEET_COVERED", "ARMPITS_COVERED",
    "ARMPITS_EXPOSED", "FACE_MALE", "BELLY_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_COVERED", "FEMALE_BREAST_COVERED",
    "BUTTOCKS_COVERED",
)

# Label: (flagged from this score, blocked from this score or None). Other labels never count.
RULES: dict[str, tuple[float, float | None]] = {
    "FEMALE_BREAST_EXPOSED": (0.20, 0.65),
    "FEMALE_GENITALIA_EXPOSED": (0.20, 0.35),
    "ANUS_EXPOSED": (0.20, 0.60),
    "MALE_GENITALIA_EXPOSED": (0.20, 0.35),
    "FEMALE_GENITALIA_COVERED": (0.40, None),
    "BUTTOCKS_EXPOSED": (0.40, None),
}

INPUT_SIZE = 640
# Detections below this score are dropped, like NudeNet does
MIN_SCORE = 0.20

BLOCKED_MESSAGE = "This image isn't allowed. See the Terms of Use at gym2.app/tos."
# The start of the report reason of blocked and flagged uploads, followed by the findings
BLOCKED_REASON = "NudeNet flagged and blocked"
FLAGGED_REASON = "NudeNet flagged but not blocked"

_session: onnxruntime.InferenceSession | None = None
_load_lock = threading.Lock()


@dataclass(frozen=True)
class Verdict:
    # The labels that reached their flag score, with their highest score
    findings: dict[str, float] = field(default_factory=dict)
    blocked: bool = False

    @property
    def flagged(self) -> bool:
        return bool(self.findings)

    @property
    def report_reason(self) -> str:
        """The reason of the report, e.g. "NudeNet flagged and blocked: FEMALE_BREAST_EXPOSED (0.83)"."""
        labels = ", ".join(
            f"{label} ({score:.2f})" for label, score in sorted(self.findings.items(), key=lambda item: -item[1])
        )
        return f"{BLOCKED_REASON if self.blocked else FLAGGED_REASON}: {labels}"


SAFE = Verdict()


def load() -> None:
    """
    Loads the model, if a path is set and it isn't loaded yet. Called when the backend starts, so that a missing model
    fails the start instead of the first upload. Raises if the file can't be loaded.
    """
    global _session
    if not settings.NUDITY_FILTER_MODEL_PATH:
        return
    with _load_lock:
        if _session is not None:
            return
        options = onnxruntime.SessionOptions()
        # Caps the cores one check uses, so that a few uploads at once don't slow down every other request
        options.intra_op_num_threads = settings.NUDITY_FILTER_THREADS
        options.inter_op_num_threads = 1
        _session = onnxruntime.InferenceSession(
            settings.NUDITY_FILTER_MODEL_PATH, options, providers=["CPUExecutionProvider"]
        )
        logger.info("Loaded the NudeNet model %s.", settings.NUDITY_FILTER_MODEL_PATH)


def _prepare(image: Image.Image) -> np.ndarray:
    """
    Scales the image to fit INPUT_SIZE and fills the rest to the right and bottom with black, like NudeNet does
    (it pads first and scales then, which is the same but needs more memory for large images).
    Returns it as a 1 x 3 x INPUT_SIZE x INPUT_SIZE array of RGB values from 0 to 1.
    """
    scale = INPUT_SIZE / max(image.size)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    canvas = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE))
    canvas.paste(image.convert("RGB").resize(size, Image.Resampling.BILINEAR))
    return (np.asarray(canvas, dtype=np.float32) / 255.0).transpose(2, 0, 1)[np.newaxis]


def detect(image: Image.Image) -> dict[str, float]:
    """
    Returns the highest score of every label found in the image (at least MIN_SCORE). Every box of the detector counts
    for its most likely label only, like in NudeNet. The boxes themselves aren't needed, so they aren't merged.
    Empty if the check is off.
    """
    if not settings.NUDITY_FILTER_MODEL_PATH:
        return {}
    load()

    session = _session
    assert session is not None  # Set by load()
    output = session.run(None, {session.get_inputs()[0].name: _prepare(image)})[0]
    # 1 x (4 box coordinates + one score per label) x boxes
    class_scores = output[0][4:].T
    best_labels = class_scores.argmax(axis=1)
    best_scores = class_scores.max(axis=1)

    scores: dict[str, float] = {}
    for label_index, score in zip(best_labels, best_scores, strict=False):
        if score >= MIN_SCORE:
            label = LABELS[label_index]
            scores[label] = max(scores.get(label, 0.0), float(score))
    return scores


def judge(scores: dict[str, float]) -> Verdict:
    """Applies RULES to the scores of detect."""
    findings: dict[str, float] = {}
    blocked = False
    for label, score in scores.items():
        if label not in RULES:
            continue
        flag_at, block_at = RULES[label]
        if score >= flag_at:
            findings[label] = score
        if block_at is not None and score >= block_at:
            blocked = True
    return Verdict(findings, blocked)


def check_image(image: Image.Image | None) -> Verdict:
    """
    Checks a decoded upload (image_service.decode_image). None (no image) is SAFE. Takes about half a second, so it
    should run before the request locks any rows.
    """
    if image is None:
        return SAFE
    return judge(detect(image))
