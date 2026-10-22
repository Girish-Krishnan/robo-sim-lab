import { python } from "@codemirror/lang-python";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { Decoration, EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

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
      const lineNo = Math.min(Math.max(1, effect.value), transaction.state.doc.lines);
      const line = transaction.state.doc.line(lineNo);
      next = Decoration.set([Decoration.line({ class: "cm-error-line" }).range(line.from)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface CodeEditor {
  getValue: () => string;
  setValue: (source: string) => void;
  highlightLine: (line: number | null) => void;
  revealLine: (line: number) => void;
  relayout: () => void;
  destroy: () => void;
}

export function createEditor(
  parent: HTMLElement,
  source: string,
  onRun: () => void,
  onChange?: (source: string) => void,
): CodeEditor {
  const run = () => {
    onRun();
    return true;
  };
  let mute = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        basicSetup,
        python(),
        oneDark,
        errorField,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (mute || !update.docChanged || !onChange) return;
          onChange(update.state.doc.toString());
        }),
        Prec.high(
          keymap.of([
            { key: "Mod-Enter", run },
            { key: "Ctrl-Enter", run },
            { key: "Meta-Enter", run },
          ]),
        ),
        EditorView.theme(
          {
            "&": { height: "100%", fontSize: "13px", backgroundColor: "#101418" },
            ".cm-scroller": {
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              lineHeight: "1.5",
            },
            "&.cm-focused": { outline: "none" },
            ".cm-gutters": { backgroundColor: "#101418", borderRight: "1px solid rgba(255,255,255,0.06)" },
          },
          { dark: true },
        ),
      ],
    }),
  });

  const observer = new ResizeObserver(() => view.requestMeasure());
  observer.observe(parent);

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (next: string) => {
      mute = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
      });
      mute = false;
    },
    highlightLine: (line: number | null) => {
      view.dispatch({ effects: setErrorLine.of(line) });
      if (line != null) {
        const at = view.state.doc.line(Math.min(line, view.state.doc.lines));
        view.dispatch({ selection: { anchor: at.from }, scrollIntoView: true });
      }
    },
    revealLine: (line: number) => {
      const target = Math.min(Math.max(1, line), view.state.doc.lines);
      const at = view.state.doc.line(target).from;
      // A cold editor clamps scroll and has no coordinates until the line
      // has been placed, so jump on a later frame and then correct.
      // Wrapped comment lines are taller than the editor's first estimate,
      // so correct from the line that actually sits at the top of the scroller.
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = Math.max(0, view.lineBlockAt(at).top - 16);
        let tries = 0;
        const step = () => {
          const shown = view.state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop + 8).from).number;
          if (shown === target || tries++ > 8) return;
          view.scrollDOM.scrollTop += (target - shown) * view.defaultLineHeight;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    relayout: () => view.requestMeasure(),
    destroy: () => {
      observer.disconnect();
      view.destroy();
    },
  };
}
