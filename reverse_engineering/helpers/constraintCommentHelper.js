const _ = require('lodash');
const { execute } = require('./connections/connection.js');

const constraintClause = () =>
	/(?:CONSTRAINT\s+((?:"[^"]+"|\S+))\s+)?(?:PRIMARY\s+KEY|UNIQUE)\s*\(([^)]*)\)(?![^,\n;]*\bCOMMENT\b)/gi;

const storedIdentifier = name => {
	const trimmed = _.trim(name);

	if (/^"[\s\S]*"$/.test(trimmed)) {
		return trimmed.slice(1, -1).replaceAll('""', '"');
	}

	return _.toUpper(trimmed);
};

const constraintNamesMatch = (ddlName, catalogName) => storedIdentifier(ddlName) === _.trim(catalogName);

const ddlColumns = columnList => columnList.split(',').map(storedIdentifier);

const columnsMatch = (columnList, catalogColumns) => {
	const columns = ddlColumns(columnList);

	return (
		columns.length === catalogColumns.length && columns.every((column, index) => column === catalogColumns[index])
	);
};

const formatConstraintComment = comment => {
	if (!String(comment).includes('$$')) {
		return `$$${comment}$$`;
	}

	return `'${String(comment).replaceAll("'", "''")}'`;
};

const groupConstraintComments = rows => {
	const grouped = rows.reduce((result, row) => {
		const current = result.get(row.CONSTRAINT_NAME) || {
			name: row.CONSTRAINT_NAME,
			comment: row.COMMENT,
			columns: [],
		};

		return result.set(row.CONSTRAINT_NAME, {
			...current,
			columns: [...current.columns, { position: Number(row.KEY_SEQUENCE), name: row.COLUMN_NAME }],
		});
	}, new Map());

	return [...grouped.values()].map(constraint => ({
		...constraint,
		columns: [...constraint.columns]
			.sort((left, right) => left.position - right.position)
			.map(column => column.name),
	}));
};

const findConstraintCommentIndex = ({ comments, rawName, columnList }) => {
	if (_.trim(rawName)) {
		return comments.findIndex(constraint => constraintNamesMatch(rawName, constraint.name));
	}

	return comments.findIndex(constraint => columnsMatch(columnList, constraint.columns));
};

const addConstraintCommentsToDdl = ({ ddl, constraintComments = [] }) => {
	const comments = groupConstraintComments(constraintComments.filter(row => row.COMMENT));

	if (!ddl || !comments.length) {
		return ddl;
	}

	return ddl.replace(constraintClause(), (clause, rawName, columnList) => {
		const index = findConstraintCommentIndex({ comments, rawName, columnList });

		if (index === -1) {
			return clause;
		}

		const [{ comment }] = comments.splice(index, 1);

		return `${clause} COMMENT ${formatConstraintComment(comment)}`;
	});
};

const rowField = (row, name) => {
	const key = Object.keys(row).find(key => _.toLower(key) === name);

	if (key) {
		return row[key];
	}
};

const normalizeConstraintRow = row => ({
	CONSTRAINT_NAME: rowField(row, 'constraint_name'),
	COMMENT: rowField(row, 'comment'),
	COLUMN_NAME: rowField(row, 'column_name'),
	KEY_SEQUENCE: rowField(row, 'key_sequence'),
});

const loadConstraintRows = async ({ statement, fullTableName, logger }) => {
	try {
		const rows = await execute(statement);

		return (rows || []).map(normalizeConstraintRow);
	} catch (err) {
		logger.log(
			'error',
			{ fullTableName, message: err.message, stack: err.stack, statement },
			'Getting constraint comments',
		);

		return [];
	}
};

const getConstraintComments = ({ fullTableName, logger }) =>
	Promise.all([
		loadConstraintRows({ statement: `SHOW PRIMARY KEYS IN TABLE ${fullTableName}`, fullTableName, logger }),
		loadConstraintRows({ statement: `SHOW UNIQUE KEYS IN TABLE ${fullTableName}`, fullTableName, logger }),
	]).then(rows => rows.flat());

const addTableConstraintComments = async ({ ddl, fullTableName, logger }) => {
	const constraintComments = await getConstraintComments({ fullTableName, logger });

	return addConstraintCommentsToDdl({ ddl, constraintComments });
};

module.exports = {
	addTableConstraintComments,
};
