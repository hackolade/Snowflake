const { generateScript } = require('./api/generateScript');
const { generateViewScript } = require('./api/generateViewScript');
const { generateContainerScript } = require('./api/generateContainerScript');
const { isDropInStatements } = require('./api/isDropInStatements');
const { applyToInstance } = require('./api/applyToInstance');
const { getExternalBrowserUrl } = require('./api/getExternalBrowserUrl');
const { testConnection } = require('./api/testConnection');

module.exports = {
	generateScript,
	generateViewScript,
	generateContainerScript,
	applyToInstance,
	getExternalBrowserUrl,
	testConnection,
	isDropInStatements,
};
