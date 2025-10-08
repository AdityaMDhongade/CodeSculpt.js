// babel-tracer.js
const t = require("@babel/types");
const generate = require("@babel/generator").default;

// --- Helpers ---
function getLine(node) {
  return node && node.loc ? node.loc.start.line : -1;
}

function makeLog(path, type, extraProps = []) {
  const line = getLine(path.node);
  return t.expressionStatement(
    t.callExpression(t.identifier("__log"), [
      t.objectExpression([
        t.objectProperty(t.identifier("action"), t.stringLiteral(type)),
        t.objectProperty(t.identifier("line"), t.numericLiteral(line)),
        ...extraProps,
      ]),
    ])
  );
}

// --- Reusable Function Instrumenter ---
function instrumentFunction(path) {
  if (path.node.body.instrumented) return; // Prevent double instrumentation

  let fnName = "anonymous";
  if (path.node.id) {
    fnName = path.node.id.name;
  } else if (t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
    fnName = path.parent.id.name;
  }

  const params = path.get("params").map(p => {
    const paramName = t.isIdentifier(p.node) ? p.node.name : "destructured";
    return t.objectProperty(
      t.identifier(paramName),
      t.identifier(paramName)
    );
  });

  if (!t.isBlockStatement(path.node.body)) {
    path.node.body = t.blockStatement([t.returnStatement(path.node.body)]);
  }

  path.get("body").unshiftContainer(
    "body",
    makeLog(path, "call", [
      t.objectProperty(t.identifier("function"), t.stringLiteral(fnName)),
      t.objectProperty(t.identifier("args"), t.objectExpression(params)),
    ])
  );

  path.node.body.instrumented = true; // Mark as instrumented
}


// --- Plugin ---
module.exports = function tracerPlugin() {
  return {
    visitor: {
      // --- All Function Types ---
      FunctionDeclaration(path) { instrumentFunction(path); },
      ArrowFunctionExpression(path) { instrumentFunction(path); },
      FunctionExpression(path) { instrumentFunction(path); },
      ClassMethod(path) { instrumentFunction(path); },
      ObjectMethod(path) { instrumentFunction(path); },

      IfStatement(path) {
        const testLog = makeLog(path.get('test'), "test", [
          t.objectProperty(
            t.identifier("expression"),
            t.stringLiteral(generate(path.node.test).code)
          ),
          t.objectProperty(t.identifier("result"), t.cloneNode(path.node.test)),
        ]);
        path.insertBefore(testLog);

        if (!t.isBlockStatement(path.node.consequent)) {
          path.node.consequent = t.blockStatement([path.node.consequent]);
        }
        if (path.node.alternate && !t.isBlockStatement(path.node.alternate)) {
          path.node.alternate = t.blockStatement([path.node.alternate]);
        }
      },

      // --- Variable Declarations & Assignments (Existing Logic) ---
      // (This logic is complex but assumed correct and remains unchanged)
      VariableDeclaration(path) {
        if (
          (t.isForStatement(path.parent) && path.key === "init") ||
          (t.isForInStatement(path.parent) && path.key === "left") ||
          (t.isForOfStatement(path.parent) && path.key === "left")
        ) {
          return;
        }
        path.get("declarations").forEach((declPath) => {
          const decl = declPath.node;
          const identifiers = Object.keys(declPath.get("id").getBindingIdentifiers());
          identifiers.forEach(idName => {
            const logNode = makeLog(declPath, "declare", [
              t.objectProperty(
                t.identifier("locals"),
                t.objectExpression([
                  t.objectProperty(
                    t.identifier(idName),
                    t.callExpression(t.identifier("__clone"), [
                      decl.init ? t.cloneNode(decl.init) : t.identifier("undefined")
                    ])
                  ),
                ])
              ),
            ]);
            path.getStatementParent().insertAfter(logNode);
          });
        });
      },
      AssignmentExpression(path) {
        if (t.isForStatement(path.parent) && (path.key === "init" || path.key === "update")) {
          return;
        }

        const isCompound = path.node.operator !== "=";

        let targetKey, valueToLog;

        if (t.isIdentifier(path.node.left)) {
          targetKey = path.node.left;
          valueToLog = isCompound ? path.node.left : path.node.right;
        } else if (t.isMemberExpression(path.node.left)) {
          const object = path.node.left.object;
          if (t.isThisExpression(object)) {
            targetKey = t.identifier("this");
            valueToLog = isCompound ? path.node.left : object;
          } else {
            targetKey = object;
            valueToLog = isCompound ? path.node.left : object;
          }
        } else {
          targetKey = t.stringLiteral(generate(path.node.left).code);
          valueToLog = isCompound ? path.node.left : path.node.right;
        }

        const logNode = makeLog(path, "assign", [
          t.objectProperty(
            t.identifier("locals"),
            t.objectExpression([
              t.objectProperty(
                targetKey,
                t.callExpression(t.identifier("__clone"), [t.cloneNode(valueToLog)])
              )
            ])
          )
        ]);

        path.getStatementParent().insertAfter(logNode);
      },
      UpdateExpression(path) {
        if (t.isForStatement(path.parent) && path.key === "update") {
          return;
        }
        const logNode = makeLog(path, "assign", [
          t.objectProperty(
            t.identifier("locals"),
            t.objectExpression([
              t.objectProperty(
                path.node.argument,
                t.callExpression(t.identifier("__clone"), [t.cloneNode(path.node.argument)])
              )
            ])
          )
        ]);
        path.getStatementParent().insertAfter(logNode);
      },

      // --- Loops and Return (Existing Logic) ---
      // (This logic is complex but assumed correct and remains unchanged)
      ForStatement(path) {
        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([path.node.body]);
        }
        const bodyPath = path.get("body");
        if (path.node.update) {
          const updateStatement = t.expressionStatement(path.node.update);
          bodyPath.pushContainer("body", updateStatement);
          let updatedVar = t.isUpdateExpression(path.node.update)
            ? path.node.update.argument
            : path.node.update.left;
          if (updatedVar) {
            const assignLog = makeLog(path, "assign", [
              t.objectProperty(
                t.identifier("locals"),
                t.objectExpression([
                  t.objectProperty(
                    updatedVar,
                    t.callExpression(t.identifier("__clone"), [t.cloneNode(updatedVar)])
                  )
                ])
              )
            ]);
            bodyPath.pushContainer("body", assignLog);
          }
          path.node.update = null;
        }
        if (path.node.test) {
          const testLog = makeLog(path, "test", [
            t.objectProperty(
              t.identifier("expression"),
              t.stringLiteral(generate(path.node.test).code)
            ),
            t.objectProperty(t.identifier("result"), t.cloneNode(path.node.test)),
          ]);
          bodyPath.unshiftContainer("body", testLog);
        }
        if (path.node.init) {
          let logNode;
          if (t.isVariableDeclaration(path.node.init)) {
            path.node.init.declarations.forEach(decl => {
              logNode = makeLog(path, "declare", [
                t.objectProperty(
                  t.identifier("locals"),
                  t.objectExpression([
                    t.objectProperty(
                      t.identifier(decl.id.name),
                      t.callExpression(t.identifier("__clone"), [
                        decl.init ? t.cloneNode(decl.init) : t.identifier("undefined")
                      ])
                    ),
                  ])
                ),
              ]);
              path.insertBefore(logNode);
            });
          } else {
            logNode = makeLog(path, "init", [
              t.objectProperty(
                t.identifier("expression"),
                t.stringLiteral(generate(path.node.init).code)
              ),
            ]);
            path.insertBefore(logNode);
          }
        }
      },
      WhileStatement(path) {
        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([path.node.body]);
        }
        path.get("body").unshiftContainer(
          "body",
          makeLog(path, "loop", [t.objectProperty(t.identifier("type"), t.stringLiteral("while"))])
        );
      },
      ForOfStatement(path) {
        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([path.node.body]);
        }
        path.get("body").unshiftContainer(
          "body",
          makeLog(path, "loop", [t.objectProperty(t.identifier("type"), t.stringLiteral("for-of"))])
        );
      },
      ReturnStatement(path) {
        path.insertBefore(
          makeLog(path, "return", [
            t.objectProperty(
              t.identifier("value"),
              path.node.argument
                ? t.callExpression(t.identifier("__clone"), [t.cloneNode(path.node.argument)])
                : t.nullLiteral()
            ),
          ])
        );
      },

      // --- Call Expressions ---
      CallExpression(path) {
        // --- THIS IS THE FIX ---
        // Check if this is a console.log call
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object, { name: "console" }) &&
          t.isIdentifier(path.node.callee.property, { name: "log" })
        ) {
          // 1. Create an array of all arguments: [arg1, arg2, ...]
          const argsArray = t.arrayExpression(path.node.arguments);

          // 2. Create an AST node for the join method: `[...].join`
          const joinMember = t.memberExpression(argsArray, t.identifier("join"));

          // 3. Create the call to join: `[...].join(' ')`
          const joinCall = t.callExpression(joinMember, [t.stringLiteral(" ")]);

          // 4. Create the final __log call using the joined string as the output
          const logNode = makeLog(path, "stdout", [
            t.objectProperty(
              t.identifier("output"),
              joinCall // The result of the join call is our output
            ),
          ]);

          // 5. Replace the original console.log with our tracer call
          path.replaceWith(logNode);
        }
      },

      ClassDeclaration(path) {
        const className = path.node.id?.name || "AnonymousClass";
        path.insertBefore(
          makeLog(path, "class", [t.objectProperty(t.identifier("class"), t.stringLiteral(className))])
        );
      },
    },
  };
};