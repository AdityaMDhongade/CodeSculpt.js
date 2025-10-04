import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../styles/Visualizer.module.css";

// Convert values to readable string
function renderValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(renderValue).join(", ")}]`;
  if (typeof value === "object") {
    if (value._className) return `[${value._className}]`;
    return JSON.stringify(value);
  }
  return String(value);
}

const Visualizer = ({ logs, step, setStep }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);
  const intervalRef = useRef(null);

  const [prevLocals, setPrevLocals] = useState([]);

  // --- Build Call Stack ---
  const stack = useMemo(() => {
    const s = [];
    for (let i = 0; i <= step; i++) {
      const entry = logs[i];
      if (!entry) continue;

      if (entry.action === "call") {
        s.push({
          func: entry.function,
          locals: {},
          args: entry.args,
          returnValue: null,
        });
      } 

    if (entry.action === "call") {
      s.push({
        func: entry.function,
        locals: {},
        args: entry.args,
        returnValue: null,
      });
    } 
    // ✅ handle variable declarations/assignments
    else if ((entry.action === "declare" || entry.action === "assign") && s.length > 0) {
      const frame = s[s.length - 1];
      Object.entries(entry.locals || {}).forEach(([k, v]) => {
        frame.locals[k] = v;
      });
    } 
    // ✅ keep line for updates too (runtime evals etc.)
    else if (entry.action === "line" && s.length > 0) {
      const frame = s[s.length - 1];
      Object.entries(entry.locals || {}).forEach(([k, v]) => {
        frame.locals[k] = v;
      });
    } 
    else if (entry.action === "return" && s.length > 0) {
      const frame = s.pop();
      frame.returnValue = entry.value;
    }
  }
  return s;
}, [logs, step]);

  // --- Collect stdout logs ---
  const stdoutLogs = useMemo(() => {
    return logs
      .slice(0, step + 1)
      .filter((entry) => entry.action === "stdout")
      .map((entry, idx) => (
        <div key={idx} className={styles.stdoutLine}>
          {renderValue(entry.output)}
        </div>
      ));
  }, [logs, step]);

  const current = logs[step] || {};

  // --- Playback Controls ---
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setStep((s) => (s + 1 < logs.length ? s + 1 : s));
      }, speed);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, logs.length, setStep]);

  // --- Track Previous Locals ---
  useEffect(() => {
    setPrevLocals(stack.map((f) => ({ ...f.locals })));
  }, [step, stack]);

  return (
    <div className={styles.visualizer}>
      {/* Step Header */}
      <div className={styles.header}>
        <h2>
          Step {step}: {current.action || "Idle"}
        </h2>
        {current.action === "line" && (
          <p className={styles.subInfo}>Executing line {current.line}</p>
        )}
        {current.action === "loop" && (
          <p className={styles.subInfo}>Loop type: {current.type}</p>
        )}
        {current.action === "class" && (
          <p className={styles.subInfo}>Class defined: {current.class}</p>
        )}
      </div>

      {/* Call Stack */}
      <div className={styles.stack}>
        <AnimatePresence>
          {stack.map((frame, idx) => {
            const prevFrameLocals = prevLocals[idx] || {};
            return (
              <motion.div
                key={`${idx}-${frame.func}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={styles.stackFrame}
              >
                <strong className={styles.funcName}>{frame.func}()</strong>

                {/* Function Args */}
                {frame.args && (
                  <div className={styles.varsRow}>
                    {Object.entries(frame.args).map(([name, value]) => (
                      <div key={name} className={styles.varBox}>
                        {name}: {renderValue(value)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Local Variables */}
                <div className={styles.varsRow}>
                  {Object.entries(frame.locals).map(([name, value]) => {
                    const changed =
                      prevFrameLocals[name] !== undefined &&
                      prevFrameLocals[name] !== value;
                    return (
                      <motion.div
                        key={name}
                        animate={{
                          backgroundColor: changed
                            ? "rgba(255, 255, 255, 1)"
                            : "rgba(194, 196, 205, 1)",
                        }}
                        transition={{ duration: 0.3 }}
                        className={styles.varBox}
                      >
                        {name}: {renderValue(value)}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Return Value */}
                {frame.returnValue !== null && (
                  <div className={styles.returnValue}>
                    return: {renderValue(frame.returnValue)}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Stdout */}
      <div className={styles.stdout}>
        <strong>Output:</strong>
        {stdoutLogs.length === 0 ? (
          <div className={styles.noOutput}>No output yet</div>
        ) : (
          stdoutLogs
        )}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button onClick={() => setStep((s) => Math.max(s - 1, 0))}>⏮ Prev</button>
        <button onClick={() => setIsPlaying((p) => !p)}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          onClick={() => setStep((s) => Math.min(s + 1, logs.length - 1))}
        >
          Next ⏭
        </button>
        <input
          type="range"
          min="300"
          max="2000"
          step="100"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        />
      </div>
    </div>
  );
};

export default Visualizer;
