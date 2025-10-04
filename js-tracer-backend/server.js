// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { transformSync } = require("@babel/core");
const tracerPlugin = require("./babel-tracer");
const vm = require("vm");

const app = express();
app.use(cors());
app.use(bodyParser.json());

/**
 * Filter logs to remove useless or duplicate entries.
 * - Remove duplicate consecutive 'line' entries for the same frame
 * - Optionally remove 'class' logs if not needed
 */
function filterLogs(rawLogs) {
  const filtered = [];
  let lastLineEntry = null;

  for (const entry of rawLogs) {
    // Skip 'class' entries (optional)
    if (entry.action === "class") continue;

    // Skip duplicate consecutive 'line' entries
    if (entry.action === "line") {
      const prev = lastLineEntry;
      if (
        prev &&
        prev.line === entry.line &&
        JSON.stringify(prev.locals) === JSON.stringify(entry.locals)
      ) {
        continue; // skip duplicate
      }
      lastLineEntry = entry;
    } else {
      lastLineEntry = null; // reset for other actions
    }

    filtered.push(entry);
  }

  return filtered;
}

app.post("/api/code/run", (req, res) => {
  const { code } = req.body;
  let logs = [];

  try {
    // Transform code with Babel tracer
    const { code: instrumented } = transformSync(code, {
      plugins: [tracerPlugin],
      parserOpts: {
        sourceType: "module",
        allowReturnOutsideFunction: true,
        locations: true, // ensures loc exists
      },
      generatorOpts: { retainLines: true },
    });

    // Sandbox execution with __log and __clone
    const wrappedCode = `
      const __logs = [];
      
      // Logging function
      function __log(e) { __logs.push(e); }

      // Deep clone function for arrays/objects
      function __clone(val) {
        if (Array.isArray(val)) return [...val];
        if (val && typeof val === 'object') return { ...val };
        return val;
      }

      ${instrumented}

      module.exports = __logs;
    `;

    const sandbox = { module: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(wrappedCode, sandbox);

    logs = sandbox.module.exports;

    // Filter logs before sending
    logs = filterLogs(logs);
  } catch (err) {
    logs = [{ error: err.message }];
  }

  console.log("Filtered Logs:", logs);
  res.json({ logs });
});

app.listen(5000, () => {
  console.log("JavaScript tracer backend running on http://localhost:5000");
});
