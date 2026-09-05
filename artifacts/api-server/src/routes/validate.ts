import { Router, type IRouter } from "express";
import { create, all, type MathNode } from "mathjs";
import {
  ValidateEquationBody,
  ValidateEquationResponse,
} from "@workspace/api-zod";
import { AsyncTaskQueue } from "../lib/async-task-queue";
import { runOptionalHeadlessVerification } from "../lib/headless-verifier";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const math = create(all, {});
const validationQueue = new AsyncTaskQueue(
  Number(process.env["MATH_VALIDATION_CONCURRENCY"]) || 4,
  Number(process.env["MATH_VALIDATION_QUEUE_LIMIT"]) || 200,
);
const UNSAFE_INPUT_RE = /(?:__proto__|constructor|prototype|import|require|process|global|window|document|subprocess|os\.|sys\.|<\s*script)/i;

type EquationMode =
  | "auto"
  | "function"
  | "parametric"
  | "implicit"
  | "implicit3d"
  | "polar"
  | "vector"
  | "piecewise"
  | "points";
type ResolvedEquationMode = Exclude<EquationMode, "auto">;
type ValidationCore = {
  valid: boolean;
  mode: ResolvedEquationMode;
  normalized: string | null;
  error: string | null;
  suggestions: string[];
  variables: string[];
};
type ValidationResult = ValidationCore & {
  animatable: boolean;
  hasTimeVariable: boolean;
  supports2dFallback: boolean;
  verificationStatus: "invalid" | "static" | "animatable";
  verificationMessage: string;
};

const RESERVED_SYMBOLS = new Set([
  "e",
  "pi",
  "tau",
  "i",
  "Infinity",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sqrt",
  "abs",
  "exp",
  "log",
  "log10",
  "pow",
  "min",
  "max",
  "theta",
]);

const LATEX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\left|\\right/g, ""],
  [/\\cdot/g, "*"],
  [/\\times/g, "*"],
  [/\\div/g, "/"],
  [/\\pi/g, "pi"],
  [/\\sin/g, "sin"],
  [/\\cos/g, "cos"],
  [/\\tan/g, "tan"],
  [/\\log/g, "log"],
  [/\\ln/g, "log"],
  [/\\exp/g, "exp"],
  [/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)"],
  [/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)"],
  [/\{([^{}]+)\}/g, "($1)"],
];

function normalizeLatex(input: string) {
  let normalized = stripOuterCollections(input);
  for (const [pattern, replacement] of LATEX_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/\^/g, "^").replace(/[ \t]+/g, " ");
  return stripOuterCollections(normalized);
}

function stripOuterCollections(input: string) {
  let value = input.trim();
  while (
    (value.startsWith("[") && value.endsWith("]")) ||
    (value.startsWith("{") && value.endsWith("}"))
  ) {
    const opening = value[0];
    const closing = opening === "[" ? "]" : "}";
    let depth = 0;
    let closesAtEnd = true;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === opening) depth += 1;
      if (value[index] === closing) depth -= 1;
      if (depth === 0 && index < value.length - 1) {
        closesAtEnd = false;
        break;
      }
    }
    if (!closesAtEnd) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function splitTopLevel(input: string, delimiters: Set<string>) {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "(") parenDepth += 1;
    if (character === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (character === "[") squareDepth += 1;
    if (character === "]") squareDepth = Math.max(0, squareDepth - 1);
    if (character === "{") curlyDepth += 1;
    if (character === "}") curlyDepth = Math.max(0, curlyDepth - 1);

    if (
      delimiters.has(character) &&
      parenDepth === 0 &&
      squareDepth === 0 &&
      curlyDepth === 0
    ) {
      const part = input.slice(start, index).trim();
      if (part) parts.push(part);
      start = index + 1;
    }
  }

  const finalPart = input.slice(start).trim();
  if (finalPart) parts.push(finalPart);
  return parts;
}

function splitExpressions(input: string, mode: EquationMode) {
  const raw = input.trim();
  const isWrappedCollection =
    (raw.startsWith("[") && raw.endsWith("]")) ||
    (raw.startsWith("{") && raw.endsWith("}"));
  const stripped = stripOuterCollections(input);
  if (!stripped) return [];

  if (mode === "parametric") {
    if (/[;\n]/.test(stripped)) {
      return splitTopLevel(stripped, new Set([";", "\n"])).flatMap((part) =>
        part.trim().startsWith("(") ? splitTopLevel(part, new Set([","])) : [part],
      );
    }
    if (/^\s*x\s*\(\s*t\s*\)\s*=/.test(stripped) || !stripped.trim().startsWith("(")) {
      return [stripped];
    }
    const grouped = splitTopLevel(stripped, new Set([","]));
    return grouped.length > 1 ? grouped : [stripped];
  }

  const expressions = splitTopLevel(stripped, new Set([",", ";", "\n"]));
  // Match the client parser for the natural "y = sin(x) y = cos(x)" form.
  // Restrict this to function-like modes so spaces inside other equation
  // syntaxes remain untouched.
  if ((mode === "function" || mode === "piecewise") && expressions.length === 1) {
    const assignments = [...stripped.matchAll(/\by\s*=/gi)].map((match) => match.index ?? -1);
    if (assignments.length > 1) {
      return assignments.map((start, index) =>
        stripped.slice(start, assignments[index + 1]).trim(),
      );
    }
  }
  return !isWrappedCollection && expressions.length === 1 ? [stripped] : expressions;
}

function parseParametricPair(input: string) {
  const named =
    input.match(/^\s*x\s*\(\s*t\s*\)\s*=\s*(.+?),\s*y\s*\(\s*t\s*\)\s*=\s*(.+)\s*$/i);
  if (named) return [named[1], named[2]];

  let pair = input.trim();
  if (pair.startsWith("(") && pair.endsWith(")")) {
    pair = pair.slice(1, -1).trim();
  }
  const parts = splitTopLevel(pair, new Set([","]));
  return parts.length === 2 ? parts : null;
}

function stripLhs(input: string, variable: string) {
  const match = input.match(
    new RegExp(`^\\s*(?:${variable}\\s*=|f\\s*\\(\\s*x\\s*\\)\\s*=)\\s*(.+)$`, "i"),
  );
  return match?.[1]?.trim() ?? input.trim();
}

function parseExpression(expression: string) {
  if (!expression || expression.length > 500) {
    throw new Error("Enter an equation with fewer than 500 characters.");
  }
  return math.parse(expression);
}

function splitPointExpressions(input: string) {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  const push = (end: number) => {
    const part = input.slice(start, end).trim();
    if (part) parts.push(part);
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "(") {
      parenDepth += 1;
      continue;
    }
    if (character === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      if (parenDepth === 0) {
        let next = index + 1;
        while (next < input.length && /\s/.test(input[next])) next += 1;
        if (input[next] === "(") {
          push(index + 1);
          start = next;
          index = next - 1;
        }
      }
      continue;
    }
    if (parenDepth === 0 && (character === ";" || character === "\n")) {
      push(index);
      start = index + 1;
      continue;
    }
    if (parenDepth === 0 && character === ",") {
      let previous = index - 1;
      while (previous >= start && /\s/.test(input[previous])) previous -= 1;
      let next = index + 1;
      while (next < input.length && /\s/.test(input[next])) next += 1;
      if (input[previous] === ")" && input[next] === "(") {
        push(index);
        start = next;
        index = next - 1;
      }
    }
  }

  push(input.length);
  return parts;
}

function parsePointPair(input: string) {
  let pair = input.trim();
  const hasParentheses = pair.startsWith("(") && pair.endsWith(")");
  const hasBrackets = pair.startsWith("[") && pair.endsWith("]");
  if (hasParentheses || hasBrackets) pair = pair.slice(1, -1).trim();
  const parts = splitTopLevel(pair, new Set([","]));
  return parts.length === 2 ? parts : null;
}

function parsePoints(input: string) {
  return splitPointExpressions(input).flatMap((line) => {
    const pair = parsePointPair(line);
    if (!pair) return [];
    try {
      return [{ x: parseExpression(pair[0]), y: parseExpression(pair[1]) }];
    } catch {
      return [];
    }
  });
}

function getVariables(nodes: MathNode[]) {
  const symbols = new Set<string>();
  for (const node of nodes) {
    node.filter((child) => child.type === "SymbolNode").forEach((child) => {
      if (child.type === "SymbolNode") {
        const name = (child as MathNode & { name: string }).name;
        if (!RESERVED_SYMBOLS.has(name)) symbols.add(name);
      }
    });
  }
  return [...symbols].sort();
}

function detectAutoMode(rawEquation: string): ResolvedEquationMode {
  const input = normalizeLatex(rawEquation).trim();
  const compact = input.replace(/\s+/g, " ").toLowerCase();
  const hasMultipleLines = input.split(/\r?\n/).filter((line) => line.trim()).length > 1;
  const hasPointPairs = /\)\s*[,;\n]\s*\(/.test(input);
  const equality = input.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
  const hasSpatialVariables =
    /\bx\b/i.test(input) && /\by\b/i.test(input) && /\bz\b/i.test(input);

  if (hasMultipleLines && input.split(/\r?\n/).every((line) => parsePointPair(line))) {
    return "points";
  }
  if (hasPointPairs && !/\b(?:x|y)\s*\(\s*t\s*\)/i.test(input)) {
    return compact.includes("t") ? "points" : "points";
  }
  if (hasSpatialVariables) {
    return "implicit3d";
  }
  if (equality && !/^\s*[xy]\s*$/i.test(equality[1]) && /\bx\b/i.test(input) && /\by\b/i.test(input)) {
    return "implicit";
  }
  if (/\b(?:r|theta|θ)\b/i.test(input) && !/\b(?:x|y)\b/i.test(input)) {
    return "polar";
  }
  if (parseParametricPair(input) && /\bt\b/i.test(input)) {
    return "parametric";
  }
  if (parseParametricPair(input) && /\b(?:x|y)\b/i.test(input)) {
    return "vector";
  }
  return "function";
}

function validateEquation(
  rawEquation: string,
  mode: EquationMode,
): ValidationResult {
  const resolvedMode = mode === "auto" ? detectAutoMode(rawEquation) : mode;
  if (rawEquation.length > 500 || UNSAFE_INPUT_RE.test(rawEquation)) {
    return {
      valid: false,
      mode: resolvedMode,
      animatable: false,
      hasTimeVariable: false,
      supports2dFallback: false,
      verificationStatus: "invalid",
      verificationMessage: "Equation is invalid/wrong.",
      normalized: null,
      error: "Equation is invalid/wrong.",
      suggestions: ["Remove non-mathematical keywords and keep the expression concise."],
      variables: [],
    };
  }
  const normalizedInput = normalizeLatex(rawEquation);
  const suggestions: string[] = [];
  const finish = (
    result: ValidationCore,
  ): ValidationResult => {
    const hasTimeVariable = result.variables.includes("t") || /\bt\b/i.test(normalizedInput);
    const animatable = result.valid && hasTimeVariable;
    const supports2dFallback = result.valid && (result.mode !== "implicit3d" || /\b(?:x|y)\b/i.test(normalizedInput));
    return {
      ...result,
      animatable,
      hasTimeVariable,
      supports2dFallback,
       verificationStatus: (result.valid ? (animatable ? "animatable" : "static") : "invalid") as ValidationResult["verificationStatus"],
      verificationMessage: result.valid
        ? animatable
          ? "Equation verified. Dynamic animation available."
          : "Equation correct. Dynamic animation not available (rendering static plot)."
        : "Equation is invalid/wrong.",
    };
  };

  try {
    if (resolvedMode === "points") {
      const points = parsePoints(normalizedInput);
      if (points.length < 2) {
        throw new Error("Add at least two valid points using one (x, y) pair per line.");
      }
      const nodes = points.flatMap((point) => [point.x, point.y]);
      const variables = getVariables(nodes).filter((name) => !["t", "a", "b"].includes(name));
      return finish({
        valid: true,
        mode: resolvedMode,
        normalized: points.map((point) => `(${point.x.toString()}, ${point.y.toString()})`).join(", "),
        error: null,
        suggestions:
          points.length < rawEquation.split(/\r?\n/).filter(Boolean).length
            ? ["Invalid lines were skipped. Use the format (x, y)."]
            : suggestions,
        variables,
      });
    }

    if (resolvedMode === "function" || resolvedMode === "piecewise" || resolvedMode === "polar") {
      const expressions = splitExpressions(normalizedInput, resolvedMode);
      const nodes: MathNode[] = [];
      const invalidExpressions: string[] = [];
      expressions.forEach((expression) => {
        try {
          nodes.push(parseExpression(stripLhs(expression, resolvedMode === "polar" ? "r" : "y")));
        } catch {
          invalidExpressions.push(expression);
        }
      });
      if (nodes.length === 0) {
        throw new Error("No valid function expressions were found.");
      }
      const variables = getVariables(nodes).filter((name) => name !== "a" && name !== "b");
      if (mode !== "polar" && variables.some((name) => !["x", "t", "a", "b"].includes(name))) {
        suggestions.push("Function graphs normally use x as the independent variable.");
      }
      invalidExpressions.forEach((expression) => {
        suggestions.push(`Skipped invalid expression: ${expression}`);
      });
      return finish({
        valid: true,
        mode: resolvedMode,
        normalized: nodes
          .map((node) => `${resolvedMode === "polar" ? "r" : "y"} = ${node.toString()}`)
          .join("; "),
        error: null,
        suggestions,
        variables,
      });
    }

    if (resolvedMode === "parametric") {
      const expressions = splitExpressions(normalizedInput, resolvedMode);
      const nodes: Array<{ x: MathNode; y: MathNode }> = [];
      const invalidExpressions: string[] = [];
      expressions.forEach((expression) => {
        const parametricInput = parseParametricPair(expression);
        if (!parametricInput) {
          invalidExpressions.push(expression);
          return;
        }
        try {
          nodes.push({
            x: parseExpression(parametricInput[0]),
            y: parseExpression(parametricInput[1]),
          });
        } catch {
          invalidExpressions.push(expression);
        }
      });
      if (nodes.length === 0) {
        throw new Error("No valid parametric expressions were found. Use (cos(t), sin(t)).");
      }
      invalidExpressions.forEach((expression) => {
        suggestions.push(`Skipped invalid expression: ${expression}`);
      });
      return finish({
        valid: true,
        mode: resolvedMode,
        normalized: nodes
          .map(({ x, y }) => `x(t) = ${x.toString()}, y(t) = ${y.toString()}`)
          .join("; "),
        error: null,
        suggestions,
        variables: getVariables(nodes.flatMap(({ x, y }) => [x, y])).filter((name) => name !== "t"),
      });
    }

    if (resolvedMode === "vector") {
      const expressions = splitExpressions(normalizedInput, resolvedMode);
      const nodes: Array<{ x: MathNode; y: MathNode }> = [];
      const invalidExpressions: string[] = [];
      expressions.forEach((expression) => {
        const pair = parseParametricPair(expression);
        if (!pair) {
          invalidExpressions.push(expression);
          return;
        }
        try {
          nodes.push({
            x: parseExpression(pair[0]),
            y: parseExpression(pair[1]),
          });
        } catch {
          invalidExpressions.push(expression);
        }
      });
      if (nodes.length === 0) {
        throw new Error("No valid vector fields were found. Use (-y, x).");
      }
      invalidExpressions.forEach((expression) => {
        suggestions.push(`Skipped invalid expression: ${expression}`);
      });
      return finish({
        valid: true,
        mode: resolvedMode,
        normalized: nodes.map(({ x, y }) => `(${x.toString()}, ${y.toString()})`).join("; "),
        error: null,
        suggestions,
        variables: getVariables(nodes.flatMap(({ x, y }) => [x, y])),
      });
    }

    const expressions = splitExpressions(normalizedInput, resolvedMode);
    const nodes: Array<{ left: MathNode; right: MathNode }> = [];
    const invalidExpressions: string[] = [];
    expressions.forEach((expression) => {
      const equality = expression.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
      if (!equality && resolvedMode !== "implicit3d") {
        invalidExpressions.push(expression);
        return;
      }
      try {
        nodes.push({
          left: parseExpression(equality?.[1] ?? expression),
          right: parseExpression(equality?.[2] ?? "0"),
        });
      } catch {
        invalidExpressions.push(expression);
      }
    });
    if (nodes.length === 0) {
      throw new Error("No valid implicit expressions were found. Use x^2 + y^2 = 1.");
    }
    const variables = getVariables(nodes.flatMap(({ left, right }) => [left, right]));
    if (!variables.includes("x") || !variables.includes("y")) {
      suggestions.push("Implicit graphs work best when both x and y appear in the equation.");
    }
    invalidExpressions.forEach((expression) => {
      suggestions.push(`Skipped invalid expression: ${expression}`);
    });
      return finish({
      valid: true,
        mode: resolvedMode,
      normalized: nodes.map(({ left, right }) => `${left.toString()} = ${right.toString()}`).join("; "),
      error: null,
      suggestions,
      variables,
      });
  } catch (error) {
    return finish({
      valid: false,
      mode: resolvedMode,
      normalized: null,
      error: error instanceof Error ? error.message : "Unable to parse this equation.",
      suggestions: [
        "Check parentheses and operators.",
        "Use * for multiplication, such as 2*x.",
      ],
      variables: [],
    });
  }
}

router.post("/validate", async (req, res) => {
  const parsed = ValidateEquationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Equation and mode are required." });
    return;
  }

  try {
    const result = await validationQueue.enqueue(() =>
      validateEquation(parsed.data.equation, parsed.data.mode as EquationMode),
    );
    const uncertain =
      parsed.data.equation.length > 180 ||
      /(?:t|a|b)/i.test(parsed.data.equation) ||
      parsed.data.mode === "implicit" ||
      parsed.data.mode === "points";
    if (result.valid && uncertain && process.env["USE_HEADLESS_VERIFIER"] === "true") {
      const headlessResult = await runOptionalHeadlessVerification(parsed.data);
      if (headlessResult.status === "unavailable" || headlessResult.status === "failed") {
        logger.warn({ reason: headlessResult.reason }, "Optional headless verifier unavailable; using local AST result");
      }
    }
    res.json(ValidateEquationResponse.parse(result));
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : "Math verification queue is busy.",
    });
  }
});

export default router;