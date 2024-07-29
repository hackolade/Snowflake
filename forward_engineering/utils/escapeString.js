const escapeString = (scriptFormat, value) =>
	scriptFormat === 'snowSight' ? `'${value.replace(/'/g, "''")}'` : `$$${value}$$`;

module.exports = {
	escapeString,
};
