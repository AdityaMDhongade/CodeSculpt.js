import { useState, useEffect, useRef } from "react";
import { Editor } from "@monaco-editor/react";
import styles from "../styles/CodeEditor.module.css";

const CodeEditor = ({ onRun, highlightLine }) => {
  // Local state to manage the code inside the editor
  const [code, setCode] = useState();
  const editorRef = useRef(null);
  const decorationsRef = useRef([]);

  // This effect handles highlighting the current line of execution
  useEffect(() => {
    const { editor, monaco } = editorRef.current || {};
    if (editor && monaco && highlightLine !== null) {
      // Use deltaDecorations to add, change, or remove decorations efficiently
      decorationsRef.current = editor.deltaDecorations(
        decorationsRef.current, // Old decorations to remove
        [
          // New decorations to add
          {
            range: new monaco.Range(highlightLine, 1, highlightLine, 1),
            options: {
              isWholeLine: true,
              className: "lineHighlight", // CSS class for styling
            },
          },
        ]
      );
      // Optionally reveal the line if it's not in view
      editor.revealLineInCenter(highlightLine);
    } else if (editor) {
      // Clear decorations if there is no line to highlight
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }
  }, [highlightLine]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = { editor, monaco };
  };

  return (
    <div className={styles.editorContainer}>
      <div className={styles.editorHeader}>
        <h2 className={styles.editorTitle}>Code Editor</h2>
        <button className={styles.runButton} onClick={() => onRun(code)}>
          ▶️ Run Code
        </button>
      </div>
      <div className={styles.editorWrapper}>
        <Editor
          height="100%"
          language="javascript"
          theme="vs-dark"
          value={code}
          onChange={(value) => setCode(value || "")}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "off",
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
