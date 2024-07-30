const { FORMATS } = require('../helpers/constants');

const escapeString = (scriptFormat, value) =>
	scriptFormat === FORMATS.SNOWSIGHT ? `'${value.replace(/'/g, "''")}'` : `$$${value}$$`;

module.exports = {
	escapeString,
};
