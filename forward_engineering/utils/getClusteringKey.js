const mapName = ({ name }) => `"${name}"`;

/**
 * @typedef {{ isActivated: boolean, name: string }} ClusteringKey
 * @param {{ clusteringKey: ClusteringKey[], isParentActivated: boolean }} clusteringKeyArgs
 * @returns {string}
 */
const getClusteringKey = ({ clusteringKey, isParentActivated }) => {
	if (!Array.isArray(clusteringKey) || clusteringKey.length === 0) {
		return '';
	}

	const activated = clusteringKey
		.filter(key => key.isActivated)
		.map(mapName)
		.join(', ');
	const deActivated = clusteringKey
		.filter(key => !key.isActivated)
		.map(mapName)
		.join(', ');

	if (!isParentActivated) {
		return `CLUSTER BY (${clusteringKey.map(mapName).join(', ')})\n`;
	}

	if (activated.length === 0) {
		return `// CLUSTER BY (${deActivated})\n`;
	}

	if (deActivated.length === 0) {
		return `CLUSTER BY (${activated})\n`;
	}

	return `CLUSTER BY (${activated}) //${deActivated}\n`;
};

module.exports = {
	getClusteringKey,
};
