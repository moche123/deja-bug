import * as ts from 'typescript';

/**
 * Structural detection, Phase 2: a small catalog of known-risky AST shapes
 * (not a generic whole-tree hash — see MVP_FASE2.md, Paso 1). Each detector
 * is a pure function over a parsed `SourceFile` and a character-offset
 * range; it returns a stable pattern id (not the matched code itself) so
 * two blocks with different variable names but the same risky shape produce
 * the same fingerprint.
 */

function nodesInRange(sourceFile: ts.SourceFile, rangeStart: number, rangeEnd: number): ts.Node[] {
	const nodes: ts.Node[] = [];
	const visit = (node: ts.Node) => {
		const start = node.getStart(sourceFile);
		const end = node.getEnd();
		if (end > rangeStart && start < rangeEnd) {
			nodes.push(node);
			ts.forEachChild(node, visit);
		}
	};
	ts.forEachChild(sourceFile, visit);
	return nodes;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
	return (
		kind === ts.SyntaxKind.EqualsToken ||
		kind === ts.SyntaxKind.PlusEqualsToken ||
		kind === ts.SyntaxKind.MinusEqualsToken ||
		kind === ts.SyntaxKind.AsteriskEqualsToken ||
		kind === ts.SyntaxKind.SlashEqualsToken
	);
}

function controlVariableName(forStatement: ts.ForStatement): string | undefined {
	if (forStatement.initializer && ts.isVariableDeclarationList(forStatement.initializer)) {
		const decl = forStatement.initializer.declarations[0];
		if (decl && ts.isIdentifier(decl.name)) {
			return decl.name.text;
		}
	}
	if (forStatement.condition && ts.isBinaryExpression(forStatement.condition) && ts.isIdentifier(forStatement.condition.left)) {
		return forStatement.condition.left.text;
	}
	return undefined;
}

function bodyReassignsVariable(body: ts.Statement, name: string): boolean {
	let found = false;
	const visit = (node: ts.Node) => {
		if (found) {
			return;
		}
		if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind) && ts.isIdentifier(node.left) && node.left.text === name) {
			found = true;
			return;
		}
		if (
			(ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
			(node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
			ts.isIdentifier(node.operand) &&
			node.operand.text === name
		) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	};
	ts.forEachChild(body, visit);
	return found;
}

/** Pattern 1: a `for` loop whose control variable is reassigned inside the body, on top of its own increment clause. */
export function detectMutableIndexLoop(sourceFile: ts.SourceFile, rangeStart: number, rangeEnd: number): string | null {
	for (const node of nodesInRange(sourceFile, rangeStart, rangeEnd)) {
		if (ts.isForStatement(node)) {
			const varName = controlVariableName(node);
			if (varName && bodyReassignsVariable(node.statement, varName)) {
				return 'mutable-index-loop';
			}
		}
	}
	return null;
}

// ts.NumericLiteral#text is normalized (e.g. "1.0" -> "1"), which loses the
// decimal point — read the raw source text instead to tell "1.0" from "1"
function looksFloaty(expression: ts.Expression, sourceFile: ts.SourceFile): boolean {
	if (ts.isNumericLiteral(expression)) {
		return expression.getText(sourceFile).includes('.');
	}
	if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.SlashToken) {
		return true;
	}
	if (ts.isParenthesizedExpression(expression)) {
		return looksFloaty(expression.expression, sourceFile);
	}
	return false;
}

/** Pattern 2: `===`/`==` comparison where at least one operand looks like a non-integer numeric value. */
export function detectFloatEquality(sourceFile: ts.SourceFile, rangeStart: number, rangeEnd: number): string | null {
	for (const node of nodesInRange(sourceFile, rangeStart, rangeEnd)) {
		if (
			ts.isBinaryExpression(node) &&
			(node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken)
		) {
			if (looksFloaty(node.left, sourceFile) || looksFloaty(node.right, sourceFile)) {
				return 'float-equality';
			}
		}
	}
	return null;
}

function containsAwait(node: ts.Node): boolean {
	let found = false;
	const visit = (n: ts.Node) => {
		if (found) {
			return;
		}
		if (ts.isAwaitExpression(n)) {
			found = true;
			return;
		}
		ts.forEachChild(n, visit);
	};
	visit(node);
	return found;
}

function isWriteToSharedState(statement: ts.Statement): boolean {
	let found = false;
	const visit = (n: ts.Node) => {
		if (found) {
			return;
		}
		if (
			ts.isBinaryExpression(n) &&
			n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			(ts.isPropertyAccessExpression(n.left) || ts.isIdentifier(n.left))
		) {
			found = true;
			return;
		}
		ts.forEachChild(n, visit);
	};
	visit(statement);
	return found;
}

function mentionsLock(sourceFile: ts.SourceFile, statement: ts.Statement): boolean {
	return /lock|mutex|acquire|semaphore/i.test(statement.getText(sourceFile));
}

/** Pattern 3: `await` followed, in the same block and without a lock/mutex in between, by a write to an object property or outer-scope variable. */
export function detectUnsafeAwaitWrite(sourceFile: ts.SourceFile, rangeStart: number, rangeEnd: number): string | null {
	for (const node of nodesInRange(sourceFile, rangeStart, rangeEnd)) {
		if (!ts.isBlock(node)) {
			continue;
		}
		const statements = node.statements;
		for (let i = 0; i < statements.length; i++) {
			if (!containsAwait(statements[i])) {
				continue;
			}
			for (let j = i + 1; j < statements.length; j++) {
				if (mentionsLock(sourceFile, statements[j])) {
					break;
				}
				if (isWriteToSharedState(statements[j])) {
					return 'unsafe-await-write';
				}
			}
		}
	}
	return null;
}

/**
 * Parses `sourceText` once and runs the full catalog over the given
 * character-offset range, returning the ids of every pattern that matched
 * (a block can trip more than one).
 */
export function computeAstFingerprint(sourceText: string, rangeStart: number, rangeEnd: number): string[] {
	const sourceFile = ts.createSourceFile('snapshot.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const patterns = [
		detectMutableIndexLoop(sourceFile, rangeStart, rangeEnd),
		detectFloatEquality(sourceFile, rangeStart, rangeEnd),
		detectUnsafeAwaitWrite(sourceFile, rangeStart, rangeEnd),
	];
	return patterns.filter((p): p is string => p !== null);
}
