const { FORMATS } = require('../helpers/constants');

const MUST_BE_ESCAPED =
	/(\\r|\\n|\\b|\\f|\\t|'|"|\\[0-9]{3}|\0|\\x5C[0-3]?[0-7]{1,2}|\x5C[xX][0-9A-Fa-f]{2}|\x5C[uU][0-9A-Fa-f]{4})/g;

const escapeString = (scriptFormat, value) =>
	scriptFormat === FORMATS.SNOWSIGHT ? `'${value.replace(MUST_BE_ESCAPED, '\\$1')}'` : `$$${value}$$`;

module.exports = {
	escapeString,
};
