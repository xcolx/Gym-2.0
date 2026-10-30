"use client";

import { useState } from "react";

// A text field bound to a stored value like a SwiftUI binding (`TextField(text: $workout.name)`): it shows the stored
// value, keeps what is typed while the edit writes it, and follows a change that came from elsewhere, e.g. a sync that
// replaced a rejected change with the server's value.

/** What a field shows while it is edited, and the values the edit stored */
interface BoundTextEdit {
  text: string;
  written: readonly string[];
}

/**
 * The edit after the stored value changed to `stored`: it goes on while the store holds a value it wrote (the live
 * query lags behind the typing), any other value came from elsewhere and is shown instead (null).
 */
export function continueEdit(edit: BoundTextEdit | null, stored: string): BoundTextEdit | null {
  return edit && edit.written.includes(stored) ? edit : null;
}

/** The next edit after the field changed to `text` and `written` was stored for it (null: nothing was stored) */
export function changeEdit(edit: BoundTextEdit | null, text: string, written: string | null): BoundTextEdit {
  const before = edit?.written ?? [];
  return { text, written: written === null || before.includes(written) ? before : [...before, written] };
}

interface BoundText {
  /** What the field shows */
  text: string;
  /** The field changed to `text` and `written` was stored for it (null if nothing was stored, e.g. while it is empty) */
  change: (text: string, written: string | null) => void;
  /** Shows the stored value again, e.g. when the field is left */
  end: () => void;
}

export function useBoundText(stored: string): BoundText {
  const [edit, setEdit] = useState<BoundTextEdit | null>(null);
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    // Adjusting the state while rendering, when the stored value changed
    setSeen(stored);
    const next = continueEdit(edit, stored);
    if (next !== edit) setEdit(next);
  }
  return {
    text: edit?.text ?? stored,
    change: (text, written) => setEdit((current) => changeEdit(current, text, written)),
    end: () => setEdit(null),
  };
}
