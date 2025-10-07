// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { transformSync } = require("@babel/core");
const tracerPlugin = require("./babel-tracer"); // Assuming your tracer is in this file
const vm = require("vm");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- HELPER FUNCTION 1: SELECT THE CORRECT EXECUTION RUN ---
/**
 * Analyzes raw logs to select the most relevant execution run for visualization.
 *
 * @param {Array<Object>} rawLogs - The complete, unfiltered log from the backend.
 * @returns {Array<Object>} A slice of the logs representing the single, correct run to visualize.
 */
function selectExecutionRun(rawLogs) {
  if (!rawLogs || rawLogs.length === 0) {
    return [];
  }

  // Find the starting index of every function call.
  const callIndices = [];
  rawLogs.forEach((log, index) => {
    if (log.action === 'call') {
      callIndices.push(index);
    }
  });

  // Decide which run to use.
  if (callIndices.length === 0) {
    // SCENARIO: No 'call' actions found (e.g., just a function definition).
    // Visualize the entire log as a "dry run".
    console.log("No function calls detected. Visualizing the definition.");
    return rawLogs;
  } else {
    // SCENARIO: One or more 'call' actions were found.
    // We only want the LAST execution run.
    const lastCallIndex = callIndices[callIndices.length - 1];
    console.log(`Multiple runs detected. Selecting the last run starting at index ${lastCallIndex}.`);
    return rawLogs.slice(lastCallIndex);
  }
}

// --- HELPER FUNCTION 2: FILTER AND CLEAN THE FRAMES ---
/**
 * Processes a single execution run into a clean, de-duplicated, and context-rich
 * sequence of frames for the visualizer.
 *
 * @param {Array<Object>} executionRun - The block of logs for a single run.
 * @returns {Array<Object>} A clean array of visualization frames.
 */
function filterLogs(executionRun) {
  if (!executionRun || executionRun.length === 0) {
    return [];
  }

  const frames = [];
  let currentState = {};
  let lastPushedState = null;
  let pendingContext = null;

  for (const log of executionRun) {
    // Accumulate state from args and locals
    if (log.action === 'call' && log.args) {
      currentState = { ...currentState, ...log.args };
    }
    if (log.locals) {
      currentState = { ...currentState, ...log.locals };
    }

    // Capture context from 'test' actions
    if (log.action === 'test') {
      pendingContext = `Tested "${log.expression}": ${log.result}`;
      continue;
    }

    // Decide whether to create a new frame
    const isSignificantAction = ['call', 'return', 'stdout'].includes(log.action);
    const stateHasChanged = JSON.stringify(currentState) !== lastPushedState;

    if (isSignificantAction || stateHasChanged) {
      const newFrame = {
        action: log.action,
        line: log.line,
        locals: JSON.parse(JSON.stringify(currentState)),
      };

      if (pendingContext) {
        newFrame.action = `${log.action} (after test)`;
        newFrame.context = pendingContext;
        pendingContext = null;
      }
      
      if (log.action === 'return') newFrame.returnValue = log.value;
      if (log.action === 'stdout') newFrame.output = log.output;

      frames.push(newFrame);
      lastPushedState = JSON.stringify(currentState);
    }
  }

  return frames;
}


// --- API ENDPOINT ---
app.post("/api/code/run", (req, res) => {
  const { code } = req.body;
  let finalFrames = [];

  try {
    // 1. Instrument the user's code with the Babel tracer plugin
    const { code: instrumented } = transformSync(code, {
      plugins: [tracerPlugin],
      parserOpts: { sourceType: "module", allowReturnOutsideFunction: true },
    });

    // 2. Prepare a sandboxed environment to execute the code safely
    const sandbox = { module: {}, console };
    vm.createContext(sandbox);
    
    // The code is wrapped to capture logs and provide helper functions
    const wrappedCode = `
      const __logs = [];
      function __log(e) { __logs.push(e); }
      function __clone(val) { /* A simple clone implementation */
        try { return JSON.parse(JSON.stringify(val)); } catch(e) { return val; }
      }
      ${instrumented}
      module.exports = __logs;
    `;

    // 3. Execute the code and get the raw logs
    vm.runInContext(wrappedCode, sandbox);
    const rawLogs = sandbox.module.exports;

    // 4. Run the logs through our two-step processing pipeline
    const executionRun = selectExecutionRun(rawLogs);
    finalFrames = filterLogs(executionRun);

  } catch (err) {
    // If anything goes wrong, send an error frame
    finalFrames = [{ error: err.message, locals: {} }];
  }

  console.log("Sending Final Frames to Client:", finalFrames.length);
  res.json({ logs: finalFrames });
});

app.listen(5000, () => {
  console.log("JavaScript tracer backend running on http://localhost:5000");
});