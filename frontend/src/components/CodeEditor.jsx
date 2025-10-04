import { useState, useEffect, useRef } from "react";
import { Editor } from "@monaco-editor/react";
import styles from "../styles/CodeEditor.module.css";

const CodeEditor = ({ code, onRun, highlightLine }) => {
  const editorRef = useRef(null);

  return (
    <div className={styles.editor}>
      <Editor
        height="250px"
        language="javascript"
        value={code}
        onChange={(value) => onRun && value !== undefined && onRun(value)}
        options={{
          minimap: { enabled: false },
          lineNumbers: "on",
          fontSize: 14,
        }}
        theme="vs-dark"
        beforeMount={(monaco) => {
          monaco.editor.defineTheme("spaceTheme", {
            base: "vs-dark",
            inherit: true,
            rules: [{ background: "0b0f1a" }],
            colors: { "editor.background": "#0b0f1a" },
          });
        }}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
      />
      <button className={styles.runButton} onClick={() => onRun(code)}>
        Run Code
      </button>
    </div>
  );
};

export default CodeEditor;
