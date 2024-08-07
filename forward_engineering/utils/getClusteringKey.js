const mapName = key => `"${key.name}"`;

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
		return `\nCLUSTER BY (${clusteringKey.map(mapName).join(', ')})`;
	}

	if (activated.length === 0) {
		return `\n// CLUSTER BY (${deActivated})`;
	}

	if (deActivated.length === 0) {
		return `\nCLUSTER BY (${activated})`;
	}

	return `\nCLUSTER BY (${activated}) //${deActivated}`;
};

module.exports = {
	getClusteringKey,
};
