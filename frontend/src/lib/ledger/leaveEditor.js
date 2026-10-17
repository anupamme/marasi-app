// WebKit, the app's webview, keeps the text selection inside a CodeMirror
// editor after focus leaves it and goes on drawing a blinking caret there,
// whether Escape, a focus shortcut or a click elsewhere took the focus. This
// clears that selection when the editor loses focus; the editor keeps its own
// and puts it back when it is focused again.
import { EditorView } from "@codemirror/view";

export const clearSelectionOnBlur = EditorView.domEventHandlers({
  blur: (_event, view) => {
    const selection = view.root.getSelection?.() ?? document.getSelection();
    if (selection?.anchorNode && view.contentDOM.contains(selection.anchorNode)) selection.removeAllRanges();
    return false;
  },
});
