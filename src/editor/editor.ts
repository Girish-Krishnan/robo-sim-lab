import { python } from "@codemirror/lang-python";
import { EditorState, Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

export interface CodeEditor {
  getValue: () => string;
  setValue: (source: string) => void;
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

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (next: string) => {
      mute = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
      });
      mute = false;
    },
    relayout: () => view.requestMeasure(),
    destroy: () => view.destroy(),
  };
}
