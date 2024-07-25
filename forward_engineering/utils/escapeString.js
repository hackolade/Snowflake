const escapeString = (targetSchemaRegistry, value) =>
	targetSchemaRegistry === 'snowSight' ? `'${value.replace(/'/g, "''")}'` : `$$${value}$$`;

module.exports = {
	escapeString,
};
