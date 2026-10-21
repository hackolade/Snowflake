const DROP_STATEMENTS = [
	'DROP SCHEMA',
	'DROP TABLE',
	'DROP COLUMN',
	'DROP VIEW',
	'DROP TAG',
	'DROP CONSTRAINT',
	'DROP PRIMARY KEY',
	'DROP UNIQUE',
];

const LANGUAGES = {
	JAVA: 'java',
	JAVASCRIPT: 'javascript',
	PYTHON: 'python',
	SCALA: 'scala',
	SQL: 'sql',
};

const FORMATS = {
	SNOWSIGHT: 'snowSight',
	CLASSIC_UI: 'classicUI',
};

module.exports = {
	DROP_STATEMENTS,
	LANGUAGES,
	FORMATS,
};
