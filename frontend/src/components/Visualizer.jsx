import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../styles/Visualizer.module.css";

// (isLinkedListNode, LinkedListVisualizer, renderValue, and usePrevious helpers are unchanged)
const isLinkedListNode = (value) => {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, 'data') &&
    Object.prototype.hasOwnProperty.call(value, 'next')
  );
};
const LinkedListVisualizer = ({ node }) => {
  if (!isLinkedListNode(node)) { return <div className={styles.llNode}>{renderValue(node)}</div>; }
  return (
    <div className={styles.linkedListContainer}>
      <div className={styles.llNode}>{renderValue(node.data)}</div>
      <div className={styles.llArrow}><svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 12H19" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" /><path d="M12 5L19 12L12 19" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" /></svg></div>
      {node.next !== null ? (<LinkedListVisualizer node={node.next} />) : (<div className={styles.llNull}>NULL</div>)}
    </div>
  );
};
function renderValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === 'string') return `"${value}"`;
  if (isLinkedListNode(value)) { return "[Linked List]"; }
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (typeof value === "object") { return JSON.stringify(value); }
  return String(value);
}
const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => { ref.current = value; });
  return ref.current;
};


const Visualizer = ({ logs, step, setStep }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const intervalRef = useRef(null);

  const currentStepData = logs[step] || { locals: {}, context: null, stack: [] };
  const currentLocals = currentStepData.locals || {};
  const prevLocals = usePrevious(currentLocals);

  // --- THIS IS THE NEW "MASTER SWITCH" ---
  // A memoized flag that checks if any variable in the current step is a linked list.
  const hasLinkedList = useMemo(() => {
    return Object.values(currentLocals).some(isLinkedListNode);
  }, [currentLocals]);

  // (The rest of the existing useMemo hooks are unchanged)
  const { array: arrayVars, scalar: scalarVars } = useMemo(() => {
    const array = {}; const scalar = {};
    for (const key in currentLocals) {
      if (Array.isArray(currentLocals[key])) { array[key] = currentLocals[key]; }
      else { scalar[key] = currentLocals[key]; }
    }
    return { array, scalar };
  }, [currentLocals]);
  const stdoutContent = useMemo(() => {
    return logs.slice(0, step + 1).filter(log => log.action.includes('stdout')).map(log => log.output);
  }, [logs, step]);

  // (Playback useEffect is unchanged)
  useEffect(() => {
    if (isPlaying) {
      if (step >= logs.length - 1) { setIsPlaying(false); return; }
      intervalRef.current = setInterval(() => {
        setStep((s) => Math.min(s + 1, logs.length - 1));
      }, 2050 - speed);
    } else { clearInterval(intervalRef.current); }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, logs, step, setStep]);

  if (!logs || logs.length === 0) {
    return (
      <div className={styles.visualizer}><div className={styles.emptyState}><h3>Ready to Visualize</h3><p>Click "Run Code" in the editor to begin the visualization.</p></div></div>
    );
  }

  return (
    <div className={styles.visualizer}>
      <div className={styles.mainContent}>
        <div className={styles.header}>
          <h2 className={styles.stepTitle}>Step {step + 1} / {logs.length}</h2>
          <p className={styles.operation}>{currentStepData.action || 'Ready'}{currentStepData.line ? ` (Line ${currentStepData.line})` : ''}</p>
          {currentStepData.context && (<p className={styles.context}>{currentStepData.context}</p>)}
        </div>

        {/* --- THIS IS THE KEY CHANGE: CONDITIONAL RENDERING --- */}
        {hasLinkedList ? (
          // IF a linked list exists, only render this special view
          <div className={styles.scalarContainer}>
            {Object.entries(currentLocals).map(([name, val]) => {
              // We only care about rendering the linked lists in this view
              if (!isLinkedListNode(val)) return null;

              return (
                <div key={name} className={styles.linkedListVariableContainer}>
                  <h3 className={styles.variableName}>{name}</h3>
                  <AnimatePresence>
                    <motion.div
                      key={JSON.stringify(val)}
                      className={styles.datastructureView}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { delay: 0.1 } }}
                      exit={{ opacity: 0 }}
                    >
                      <LinkedListVisualizer node={val} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ) : (
          // ELSE, if no linked lists, render the normal view with everything
          <>
            {/* Array Visualization (Unchanged) */}
            {Object.keys(arrayVars).length > 0 && (
              <div className={styles.arrayContainer}>
                {Object.entries(arrayVars).map(([name, arr]) => {
                  const prevArray = prevLocals?.hasOwnProperty(name) ? prevLocals[name] : [];
                  return (
                    <div key={name}>
                      <h3 className={styles.variableName}>{name}</h3>
                      <div className={styles.arrayBlocks}>
                        {arr.map((val, idx) => {
                          const prevValue = prevArray ? prevArray[idx] : undefined;
                          const hasChanged = prevValue !== undefined && JSON.stringify(prevValue) !== JSON.stringify(val);
                          return (
                            <motion.div key={`${name}-${idx}`} layout initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1, background: hasChanged ? "linear-gradient(135deg, #F59E0B, #FBBF24)" : "linear-gradient(135deg, #475569, #334155)" }} transition={{ duration: 0.4 }} className={styles.block}>
                              <span className={styles.blockIndex}>{idx}</span>
                              <span className={styles.blockValue}>{renderValue(val)}</span>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}


            {/* Scalar Visualization (Unchanged) */}
            {Object.keys(scalarVars).length > 0 && (
              <div className={styles.scalarContainer}>
                <h3 className={styles.variableName}>Variables</h3>
                <div className={styles.scalarGrid}>
                  {Object.entries(scalarVars).map(([name, val]) => {
                    const prevValue = prevLocals ? prevLocals[name] : undefined;
                    const hasChanged = prevValue !== undefined && JSON.stringify(prevValue) !== JSON.stringify(val);
                    return (
                      <motion.div key={name} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, scale: hasChanged ? [1, 1.15, 1] : 1, background: hasChanged ? "linear-gradient(135deg, #F59E0B, #FBBF24)" : "linear-gradient(135deg, #334155, #1E2D3B)", boxShadow: hasChanged ? "0 0 16px rgba(251, 191, 36, 0.6)" : "0 4px 12px rgba(0,0,0,0.4)" }} transition={{ duration: 0.5 }} className={styles.scalar}>
                        <span className={styles.scalarName}>{name}</span>
                        <span className={styles.scalarValue}>{renderValue(val)}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Console Output (Unchanged) */}
            {stdoutContent.length > 0 && (
              <div className={styles.stdoutContainer}>
                <h3 className={styles.variableName}>Console Output</h3>
                <pre className={styles.stdoutContent}>
                  {stdoutContent.map((line, index) => (
                    <div key={index}>{renderValue(line)}</div>
                  ))}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* --- Controls (Unchanged) --- */}
      <div className={styles.controls}>
        <button onClick={() => setStep(0)}>↩ Reset</button>
        <button onClick={() => setStep((s) => Math.max(s - 1, 0))}>⏮ Prev</button>
        <button className={styles.playButton} onClick={() => setIsPlaying((p) => !p)}>
          {isPlaying ? "⏸ Pause" : "▶️ Play"}
        </button>
        <button onClick={() => setStep((s) => Math.min(s + 1, logs.length - 1))}>Next ⏭</button>
      </div>
      <div className={styles.speedControl}>
        <span>Speed</span>
        <input type="range" min="50" max="2000" step="50" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
      </div>
    </div>
  );
};

export default Visualizer;