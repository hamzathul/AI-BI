import { quoteIdent } from '../query/sql-ident.js';

/**
 * A deliberately tiny arithmetic language for metric expressions (D50).
 *
 * Metric bodies are not SQL. They are columns of one dataset combined with
 * numbers and `+ - * /` and parentheses. Parsing into this AST lets the
 * compiler quote every column from the metadata allowlist and reject anything
 * else before a statement is built.
 */
export type MetricExpressionNode =
  | { kind: 'number'; value: string }
  | { kind: 'column'; name: string }
  | {
      kind: 'binary';
      operator: '+' | '-' | '*' | '/';
      left: MetricExpressionNode;
      right: MetricExpressionNode;
    };

export class MetricExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricExpressionError';
  }
}

type TokenType =
  'number' | 'identifier' | 'operator' | 'leftParen' | 'rightParen';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'operator', value: char, position: index });
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'leftParen', value: char, position: index });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'rightParen', value: char, position: index });
      index += 1;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const start = index;
      while (index < input.length && /[0-9]/.test(input[index]!)) index += 1;

      if (input[index] === '.') {
        index += 1;
        if (index >= input.length || !/[0-9]/.test(input[index]!)) {
          throw new MetricExpressionError(
            `Expected digits after the decimal point at position ${index + 1}.`,
          );
        }
        while (index < input.length && /[0-9]/.test(input[index]!)) index += 1;
      }

      tokens.push({
        type: 'number',
        value: input.slice(start, index),
        position: start,
      });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      while (index < input.length && /[A-Za-z0-9_]/.test(input[index]!)) {
        index += 1;
      }
      tokens.push({
        type: 'identifier',
        value: input.slice(start, index),
        position: start,
      });
      continue;
    }

    throw new MetricExpressionError(
      `Unexpected character "${char}" at position ${index + 1}. ` +
        'Use column names, numbers, + - * / and parentheses.',
    );
  }

  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly expression: string,
  ) {}

  parse(): MetricExpressionNode {
    if (this.tokens.length === 0) {
      throw new MetricExpressionError('Metric expression must not be empty.');
    }

    const node = this.parseExpression();
    const next = this.tokens[this.index];

    if (next) {
      throw new MetricExpressionError(
        `Unexpected token "${next.value}" at position ${next.position + 1}.`,
      );
    }

    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private consume(type: TokenType): Token | undefined {
    const token = this.peek();
    if (token?.type !== type) return undefined;
    this.index += 1;
    return token;
  }

  private parseExpression(): MetricExpressionNode {
    let left = this.parseTerm();

    while (this.peek()?.type === 'operator') {
      const operator = this.peek()!.value;
      if (operator !== '+' && operator !== '-') break;

      this.index += 1;
      const right = this.parseTerm();
      left = { kind: 'binary', operator, left, right };
    }

    return left;
  }

  private parseTerm(): MetricExpressionNode {
    let left = this.parseFactor();

    while (this.peek()?.type === 'operator') {
      const operator = this.peek()!.value;
      if (operator !== '*' && operator !== '/') break;

      this.index += 1;
      const right = this.parseFactor();
      left = { kind: 'binary', operator, left, right };
    }

    return left;
  }

  private parseFactor(): MetricExpressionNode {
    const token = this.peek();

    if (!token) {
      const position = this.expression.length + 1;
      throw new MetricExpressionError(
        `Expected a column, number, or "(" at position ${position}.`,
      );
    }

    if (token.type === 'number') {
      this.index += 1;
      return { kind: 'number', value: token.value };
    }

    if (token.type === 'identifier') {
      this.index += 1;
      return { kind: 'column', name: token.value };
    }

    if (token.type === 'leftParen') {
      this.index += 1;
      const node = this.parseExpression();
      const closing = this.consume('rightParen');

      if (!closing) {
        throw new MetricExpressionError(
          `Expected ")" after the expression at position ${token.position + 1}.`,
        );
      }

      return node;
    }

    throw new MetricExpressionError(
      `Unexpected token "${token.value}" at position ${token.position + 1}.`,
    );
  }
}

/** Parses `column * 2 + bonus` into a validated AST. */
export function parseMetricExpression(input: string): MetricExpressionNode {
  return new Parser(tokenize(input), input).parse();
}

/** Returns every column referenced by an expression, in first-seen order. */
export function collectMetricExpressionColumns(
  node: MetricExpressionNode,
): string[] {
  const columns: string[] = [];

  function visit(current: MetricExpressionNode): void {
    if (current.kind === 'column') {
      if (!columns.includes(current.name)) columns.push(current.name);
      return;
    }
    if (current.kind === 'binary') {
      visit(current.left);
      visit(current.right);
    }
  }

  visit(node);
  return columns;
}

const PRECEDENCE: Record<'+' | '-' | '*' | '/', number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

/**
 * Renders the AST with only the parentheses needed by precedence.
 *
 * The alias is the table alias of the metric's dataset; every column name in
 * the AST has already been checked against that dataset's metadata.
 */
export function renderMetricExpression(
  node: MetricExpressionNode,
  alias: string,
): string {
  function render(
    current: MetricExpressionNode,
    parentPrecedence: number,
  ): string {
    if (current.kind === 'number') return current.value;
    if (current.kind === 'column') {
      return `${alias}.${quoteIdent(current.name)}`;
    }

    const precedence = PRECEDENCE[current.operator];
    const left = render(current.left, precedence);
    // Right operands need a higher threshold so `a - (b - c)` keeps its
    // parentheses and `a / (b * c)` cannot be reinterpreted.
    const right = render(current.right, precedence + 1);
    const expression = `${left} ${current.operator} ${right}`;

    return precedence < parentPrecedence ? `(${expression})` : expression;
  }

  return render(node, 0);
}
