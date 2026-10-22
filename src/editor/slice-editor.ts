import { python } from "@codemirror/lang-python";
import { Decoration, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";

const setErrorLine = StateEffect.define<number | null>();

const errorField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(marks, transaction) {
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setErrorLine)) continue;
      if (effect.value == null) {
        next = Decoration.none;
        continue;
      }
      const doc = transaction.state.doc;
      const lineNo = Math.min(Math.max(1, effect.value), doc.lines);
      const line = doc.line(lineNo);
      next = Decoration.set([Decoration.line({ class: "cm-error-line" }).range(line.from)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface SliceEditor {
  view: EditorView;
  highlight: (localLine: number | null) => void;
  destroy: () => void;
}

/** A short Python editor for one lesson slice. Line numbers match the slice, not the hidden program. */
export function createSliceEditor(
  parent: HTMLElement,
  source: string,
  onChange: (value: string) => void,
  onRun: () => void,
): SliceEditor {
  let mute = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        lineNumbers(),
        python(),
        oneDark,
        errorField,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (mute || !update.docChanged) return;
          onChange(update.state.doc.toString());
        }),
        Prec.high(
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                onRun();
                return true;
              },
            },
          ]),
        ),
        EditorView.theme(
          {
            "&": { height: "auto", fontSize: "12.5px", backgroundColor: "#101418" },
            ".cm-scroller": { fontFamily: '"IBM Plex Mono", ui-monospace, monospace', lineHeight: "1.45", maxHeight: "240px" },
            ".cm-gutters": { backgroundColor: "#101418", borderRight: "1px solid rgba(255,255,255,0.06)" },
            "&.cm-focused": { outline: "none" },
            ".cm-error-line": { backgroundColor: "rgba(227, 109, 92, 0.28)" },
          },
          { dark: true },
        ),
      ],
    }),
  });
  return {
    view,
    highlight(localLine) {
      view.dispatch({ effects: setErrorLine.of(localLine) });
      if (localLine != null) {
        const line = view.state.doc.line(Math.min(localLine, view.state.doc.lines));
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      }
    },
    destroy: () => view.destroy(),
  };
}
