import { useState } from "react";
import CodeEditor from "../components/CodeEditor";
import Visualizer from "../components/Visualizer";

const Home = () => {
  const [logs, setLogs] = useState([]);
  const [code, setCode] = useState("");
  const [currentStep, setCurrentStep] = useState(0);

  const runCode = async (codeInput) => {
    setCode(codeInput);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const data = await res.json();
      setLogs(data.logs);
      setCurrentStep(0);
    } catch (err) {
      console.error(err);
      setLogs([{ error: err.message }]);
    }
  };

  return (
    <div style={{ padding: "1rem", maxWidth: "900px", margin: "auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: "1rem" }}>
        JavaScript Code Visualizer
      </h1>

      <div className="home-container">
        <div className="code-editor-container">
          <CodeEditor
            code={code}
            onRun={runCode}
            highlightLine={logs[currentStep]?.line ? logs[currentStep].line - 1 : null}
          />
        </div>

        <div className="visualizer-container">
          {logs.length > 0 && (
            <Visualizer logs={logs} step={currentStep} setStep={setCurrentStep} />
          )}
        </div>
      </div>

    </div>
  );
};

export default Home;
