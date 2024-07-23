const _ = require('lodash');
const { getAlterScriptDtos } = require('./alterScriptFromDeltaHelper');
const { AlterScriptDto } = require('./types/AlterScriptDto');
const { CoreData, App } = require('../types/coreApplicationTypes');

/**
 * @return {({ dtos, shouldApplyDropStatements }: { dtos: AlterScriptDto[], shouldApplyDropStatements: boolean }) => string}
 * */
const joinAlterScriptDtosIntoScript = ({ dtos, shouldApplyDropStatements }) => {
	const { commentIfDeactivated } = require('../helpers/commentDeactivatedHelper');

	return dtos
		.map(dto => {
			if (dto.isActivated === false) {
				return dto.scripts.map(scriptDto =>
					commentIfDeactivated(
						scriptDto.script,
						{
							isActivated: false,
						},
						false,
					),
				);
			}
			if (!shouldApplyDropStatements) {
				return dto.scripts.map(scriptDto =>
					commentIfDeactivated(
						scriptDto.script,
						{
							isActivated: !scriptDto.isDropScript,
						},
						false,
					),
				);
			}
			return dto.scripts.map(scriptDto => scriptDto.script);
		})
		.flat()
		.filter(Boolean)
		.map(scriptLine => scriptLine.trim())
		.filter(Boolean)
		.join('\n\n');
};

const mapCoreDataForContainerLevelScripts = data => {
	return {
		...data,
		jsonSchema: data.collections[0],
		internalDefinitions: Object.values(data.internalDefinitions)[0],
	};
};

/**
 * @param {{ data: CoreData, app: App, ddlProvider: object }}
 * @return {string}
 * */
const buildContainerLevelAlterScript = ({ data, app, ddlProvider }) => {
	const preparedData = mapCoreDataForContainerLevelScripts(data);
	const alterScriptDtos = getAlterScriptDtos({ data: preparedData, app, ddlProvider });
	const shouldApplyDropStatements = preparedData.options?.additionalOptions?.some(
		option => option.id === 'applyDropStatements' && option.value,
	);

	return joinAlterScriptDtosIntoScript({ dtos: alterScriptDtos, shouldApplyDropStatements });
};

module.exports = {
	buildContainerLevelAlterScript,
};
