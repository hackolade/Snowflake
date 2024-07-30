const { DROP_STATEMENTS } = require('../constants');

const commentDropStatements = (script = '') =>
	script
		.split('\n')
		.filter(line => line.trim())
		.map(line => {
			if (DROP_STATEMENTS.some(statement => line.includes(statement))) {
				return `// ${line}`;
			}

			return line;
		})
		.join('\n');

module.exports = {
	commentDropStatements,
};
