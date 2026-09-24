import ts from 'typescript';
import { ESLintUtils } from '@typescript-eslint/utils';

export const noFloatMoney = {
  meta: { type: 'problem', schema: [], messages: { floating: 'Use bigint Money operations. Number/float arithmetic on money is prohibited.', decimal: 'Decimal literals and float parsing are prohibited in financial modules.' } },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const typeAt = node => checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
    function hasBigInt(type) {
      return Boolean(type.flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) || (type.isUnion() && type.types.every(hasBigInt));
    }
    function isFinancial(node) {
      if (!node) return false;
      if (node.type === 'Identifier') return /(?:minor|amount|balance|money|gross|net|tax|funded|price)/i.test(node.name);
      if (node.type === 'MemberExpression') return isFinancial(node.property) || isFinancial(node.object);
      if (node.type === 'CallExpression') return isFinancial(node.callee) || node.arguments.some(isFinancial);
      if (node.type === 'BinaryExpression') return isFinancial(node.left) || isFinancial(node.right);
      return false;
    }
    function target(node) {
      const p = node.parent;
      return p?.type === 'VariableDeclarator' ? p.id : p?.type === 'AssignmentExpression' ? p.left : p?.type === 'Property' ? p.key : null;
    }
    return {
      BinaryExpression(node) {
        if (!['+', '-', '*', '/', '%', '**'].includes(node.operator)) return;
        if (!(isFinancial(node) || isFinancial(target(node)))) return;
        const a = typeAt(node.left), b = typeAt(node.right);
        if (node.operator === '+' && ((a.flags | b.flags) & ts.TypeFlags.StringLike)) return;
        if (!hasBigInt(a) || !hasBigInt(b)) context.report({ node, messageId: 'floating' });
      },
      AssignmentExpression(node) {
        if (node.operator !== '=' && isFinancial(node.left) && (!hasBigInt(typeAt(node.left)) || !hasBigInt(typeAt(node.right)))) context.report({ node, messageId: 'floating' });
      },
      UpdateExpression(node) {
        if (isFinancial(node.argument) && !hasBigInt(typeAt(node.argument))) context.report({ node, messageId: 'floating' });
      },
      Literal(node) {
        if (/src\/(core\/money|ledger|ingest|intelligence|brain)\//.test(context.filename) && typeof node.value === 'number' && !Number.isInteger(node.value)) context.report({ node, messageId: 'decimal' });
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && ['parseFloat'].includes(node.callee.name)) context.report({ node, messageId: 'decimal' });
        if (node.callee.type === 'Identifier' && node.callee.name === 'Number' && node.arguments[0] && hasBigInt(typeAt(node.arguments[0]))) {
          let parent = node.parent;
          while (parent && parent.type !== 'FunctionDeclaration') parent = parent.parent;
          const allowed = /src\/core\/money\/index\.ts$/.test(context.filename) && parent?.id?.name === 'toDatabase';
          if (!allowed) context.report({ node, messageId: 'floating' });
        }
      },
    };
  },
};
